//! Verelle's exact RFC 9807 OPAQUE profile.
//!
//! This crate centralizes the suite, identities, context, Argon2 parameters,
//! serialization, server-key consistency check, and export-key domain
//! separation so the web, native clients, and server cannot drift.

use hkdf::Hkdf;
use opaque_ke::{
    CipherSuite, ClientLogin, ClientLoginFinishParameters, ClientRegistration,
    ClientRegistrationFinishParameters, CredentialFinalization, CredentialRequest,
    CredentialResponse, Identifiers, RegistrationRequest, RegistrationResponse, RegistrationUpload,
    ServerLogin, ServerLoginParameters, ServerRegistration, ServerSetup, TripleDh,
    argon2::{Algorithm, Argon2, Params, Version},
};
use rand::rngs::OsRng;
use sha2::{Digest, Sha256, Sha512};
use thiserror::Error;
use zeroize::Zeroize;

pub const SERVER_IDENTITY: &[u8] = b"verelle.app";
pub const AUTH_CONTEXT: &[u8] = b"verelle/auth/v1";
pub const ARGON2_MEMORY_KIB: u32 = 65_536;
pub const ARGON2_ITERATIONS: u32 = 3;
pub const ARGON2_PARALLELISM: u32 = 1;
const WRAPPING_KEY_BYTES: usize = 32;

pub struct VerelleCipherSuite;

impl CipherSuite for VerelleCipherSuite {
    type OprfCs = opaque_ke::Ristretto255;
    type KeyExchange = TripleDh<opaque_ke::Ristretto255, Sha512>;
    type Ksf = Argon2<'static>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClientRegistrationStart {
    pub state: Vec<u8>,
    pub request: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClientRegistrationFinish {
    pub upload: Vec<u8>,
    pub export_key: Vec<u8>,
    pub server_public_key: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClientLoginStart {
    pub state: Vec<u8>,
    pub request: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClientLoginFinish {
    pub finalization: Vec<u8>,
    pub export_key: Vec<u8>,
    pub server_public_key: Vec<u8>,
    pub session_key: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServerLoginStart {
    pub state: Vec<u8>,
    pub response: Vec<u8>,
}

#[derive(Debug, Error, Clone, Copy, PartialEq, Eq)]
pub enum AuthProtocolError {
    #[error("OPAQUE message or state is invalid")]
    InvalidEncoding,
    #[error("OPAQUE protocol operation failed")]
    Protocol,
    #[error("server static key changed")]
    ServerKeyChanged,
    #[error("account identifier is invalid")]
    InvalidAccountIdentifier,
    #[error("key derivation failed")]
    KeyDerivation,
}

pub fn generate_server_setup() -> Vec<u8> {
    ServerSetup::<VerelleCipherSuite>::new(&mut OsRng)
        .serialize()
        .to_vec()
}

pub fn normalize_account_identifier(value: &str) -> Result<String, AuthProtocolError> {
    let normalized = value.trim().to_ascii_lowercase();
    let Some((local, domain)) = normalized.split_once('@') else {
        return Err(AuthProtocolError::InvalidAccountIdentifier);
    };
    if normalized.len() > 254
        || local.is_empty()
        || domain.is_empty()
        || domain.starts_with('.')
        || domain.ends_with('.')
        || !normalized.is_ascii()
        || normalized
            .bytes()
            .any(|byte| byte.is_ascii_whitespace() || byte.is_ascii_control())
    {
        return Err(AuthProtocolError::InvalidAccountIdentifier);
    }
    Ok(normalized)
}

pub fn account_credential_identifier(value: &str) -> Result<[u8; 32], AuthProtocolError> {
    let normalized = normalize_account_identifier(value)?;
    Ok(Sha256::digest(normalized.as_bytes()).into())
}

pub fn server_static_public_key(server_setup: &[u8]) -> Result<Vec<u8>, AuthProtocolError> {
    let setup = deserialize_server_setup(server_setup)?;
    Ok(setup.keypair().public().serialize().to_vec())
}

pub fn client_registration_start(
    password: &[u8],
) -> Result<ClientRegistrationStart, AuthProtocolError> {
    let started = ClientRegistration::<VerelleCipherSuite>::start(&mut OsRng, password)
        .map_err(|_| AuthProtocolError::Protocol)?;
    Ok(ClientRegistrationStart {
        state: started.state.serialize().to_vec(),
        request: started.message.serialize().to_vec(),
    })
}

pub fn server_registration_start(
    server_setup: &[u8],
    account_identifier: &[u8],
    request: &[u8],
) -> Result<Vec<u8>, AuthProtocolError> {
    validate_account_identifier(account_identifier)?;
    let setup = deserialize_server_setup(server_setup)?;
    let request = RegistrationRequest::<VerelleCipherSuite>::deserialize(request)
        .map_err(|_| AuthProtocolError::InvalidEncoding)?;
    let started = ServerRegistration::start(&setup, request, account_identifier)
        .map_err(|_| AuthProtocolError::Protocol)?;
    Ok(started.message.serialize().to_vec())
}

pub fn client_registration_finish(
    state: &[u8],
    password: &[u8],
    account_identifier: &[u8],
    response: &[u8],
) -> Result<ClientRegistrationFinish, AuthProtocolError> {
    validate_account_identifier(account_identifier)?;
    let state = ClientRegistration::<VerelleCipherSuite>::deserialize(state)
        .map_err(|_| AuthProtocolError::InvalidEncoding)?;
    let response = RegistrationResponse::<VerelleCipherSuite>::deserialize(response)
        .map_err(|_| AuthProtocolError::InvalidEncoding)?;
    let argon2 = argon2()?;
    let finished = state
        .finish(
            &mut OsRng,
            password,
            response,
            ClientRegistrationFinishParameters::new(identifiers(account_identifier), Some(&argon2)),
        )
        .map_err(|_| AuthProtocolError::Protocol)?;
    Ok(ClientRegistrationFinish {
        upload: finished.message.serialize().to_vec(),
        export_key: finished.export_key.to_vec(),
        server_public_key: finished.server_s_pk.serialize().to_vec(),
    })
}

pub fn server_registration_finish(upload: &[u8]) -> Result<Vec<u8>, AuthProtocolError> {
    let upload = RegistrationUpload::<VerelleCipherSuite>::deserialize(upload)
        .map_err(|_| AuthProtocolError::InvalidEncoding)?;
    Ok(ServerRegistration::finish(upload).serialize().to_vec())
}

pub fn client_login_start(password: &[u8]) -> Result<ClientLoginStart, AuthProtocolError> {
    let started = ClientLogin::<VerelleCipherSuite>::start(&mut OsRng, password)
        .map_err(|_| AuthProtocolError::Protocol)?;
    Ok(ClientLoginStart {
        state: started.state.serialize().to_vec(),
        request: started.message.serialize().to_vec(),
    })
}

pub fn server_login_start(
    server_setup: &[u8],
    password_file: Option<&[u8]>,
    account_identifier: &[u8],
    request: &[u8],
) -> Result<ServerLoginStart, AuthProtocolError> {
    validate_account_identifier(account_identifier)?;
    let setup = deserialize_server_setup(server_setup)?;
    let password_file = password_file
        .map(|bytes| {
            ServerRegistration::<VerelleCipherSuite>::deserialize(bytes)
                .map_err(|_| AuthProtocolError::InvalidEncoding)
        })
        .transpose()?;
    let request = CredentialRequest::<VerelleCipherSuite>::deserialize(request)
        .map_err(|_| AuthProtocolError::InvalidEncoding)?;
    let started = ServerLogin::start(
        &mut OsRng,
        &setup,
        password_file,
        request,
        account_identifier,
        server_login_parameters(account_identifier),
    )
    .map_err(|_| AuthProtocolError::Protocol)?;
    Ok(ServerLoginStart {
        state: started.state.serialize().to_vec(),
        response: started.message.serialize().to_vec(),
    })
}

pub fn client_login_finish(
    state: &[u8],
    password: &[u8],
    account_identifier: &[u8],
    response: &[u8],
    expected_server_public_key: &[u8],
) -> Result<ClientLoginFinish, AuthProtocolError> {
    validate_account_identifier(account_identifier)?;
    let state = ClientLogin::<VerelleCipherSuite>::deserialize(state)
        .map_err(|_| AuthProtocolError::InvalidEncoding)?;
    let response = CredentialResponse::<VerelleCipherSuite>::deserialize(response)
        .map_err(|_| AuthProtocolError::InvalidEncoding)?;
    let argon2 = argon2()?;
    let finished = state
        .finish(
            &mut OsRng,
            password,
            response,
            ClientLoginFinishParameters::new(
                Some(AUTH_CONTEXT),
                identifiers(account_identifier),
                Some(&argon2),
            ),
        )
        .map_err(|_| AuthProtocolError::Protocol)?;
    let server_public_key = finished.server_s_pk.serialize().to_vec();
    if server_public_key != expected_server_public_key {
        return Err(AuthProtocolError::ServerKeyChanged);
    }
    Ok(ClientLoginFinish {
        finalization: finished.message.serialize().to_vec(),
        export_key: finished.export_key.to_vec(),
        server_public_key,
        session_key: finished.session_key.to_vec(),
    })
}

pub fn server_login_finish(
    state: &[u8],
    account_identifier: &[u8],
    finalization: &[u8],
) -> Result<Vec<u8>, AuthProtocolError> {
    validate_account_identifier(account_identifier)?;
    let state = ServerLogin::<VerelleCipherSuite>::deserialize(state)
        .map_err(|_| AuthProtocolError::InvalidEncoding)?;
    let finalization = CredentialFinalization::<VerelleCipherSuite>::deserialize(finalization)
        .map_err(|_| AuthProtocolError::InvalidEncoding)?;
    let finished = state
        .finish(finalization, server_login_parameters(account_identifier))
        .map_err(|_| AuthProtocolError::Protocol)?;
    Ok(finished.session_key.to_vec())
}

pub fn derive_account_wrapping_key(
    mut export_key: Vec<u8>,
) -> Result<[u8; WRAPPING_KEY_BYTES], AuthProtocolError> {
    if export_key.len() != 64 {
        export_key.zeroize();
        return Err(AuthProtocolError::KeyDerivation);
    }
    let hkdf = Hkdf::<Sha256>::new(Some(b"verelle/opaque-export/v1"), &export_key);
    let mut key = [0_u8; WRAPPING_KEY_BYTES];
    let result = hkdf
        .expand(b"account-data-key-wrap", &mut key)
        .map_err(|_| AuthProtocolError::KeyDerivation);
    export_key.zeroize();
    result.map(|()| key)
}

fn deserialize_server_setup(
    bytes: &[u8],
) -> Result<ServerSetup<VerelleCipherSuite>, AuthProtocolError> {
    ServerSetup::<VerelleCipherSuite>::deserialize(bytes)
        .map_err(|_| AuthProtocolError::InvalidEncoding)
}

fn identifiers(account_identifier: &[u8]) -> Identifiers<'_> {
    Identifiers {
        client: Some(account_identifier),
        server: Some(SERVER_IDENTITY),
    }
}

fn server_login_parameters(account_identifier: &[u8]) -> ServerLoginParameters<'_, '_> {
    ServerLoginParameters {
        context: Some(AUTH_CONTEXT),
        identifiers: identifiers(account_identifier),
    }
}

fn argon2() -> Result<Argon2<'static>, AuthProtocolError> {
    let params = Params::new(
        ARGON2_MEMORY_KIB,
        ARGON2_ITERATIONS,
        ARGON2_PARALLELISM,
        None,
    )
    .map_err(|_| AuthProtocolError::KeyDerivation)?;
    Ok(Argon2::new(Algorithm::Argon2id, Version::V0x13, params))
}

fn validate_account_identifier(account_identifier: &[u8]) -> Result<(), AuthProtocolError> {
    if account_identifier.is_empty() || account_identifier.len() > 254 {
        return Err(AuthProtocolError::InvalidAccountIdentifier);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const ACCOUNT: &[u8] = b"founder@example.com";
    const PASSWORD: &[u8] = b"correct horse battery staple";

    fn register(server_setup: &[u8]) -> (Vec<u8>, Vec<u8>, Vec<u8>) {
        let started = client_registration_start(PASSWORD).unwrap();
        let response = server_registration_start(server_setup, ACCOUNT, &started.request).unwrap();
        let finished =
            client_registration_finish(&started.state, PASSWORD, ACCOUNT, &response).unwrap();
        let password_file = server_registration_finish(&finished.upload).unwrap();
        (
            password_file,
            finished.export_key,
            finished.server_public_key,
        )
    }

    #[test]
    fn registration_and_login_match_session_and_export_keys() {
        let server_setup = generate_server_setup();
        let (password_file, registration_export_key, server_public_key) = register(&server_setup);
        let started = client_login_start(PASSWORD).unwrap();
        let server_started = server_login_start(
            &server_setup,
            Some(&password_file),
            ACCOUNT,
            &started.request,
        )
        .unwrap();
        let client_finished = client_login_finish(
            &started.state,
            PASSWORD,
            ACCOUNT,
            &server_started.response,
            &server_public_key,
        )
        .unwrap();
        let server_session = server_login_finish(
            &server_started.state,
            ACCOUNT,
            &client_finished.finalization,
        )
        .unwrap();
        assert_eq!(client_finished.session_key, server_session);
        assert_eq!(client_finished.export_key, registration_export_key);
    }

    #[test]
    fn wrong_password_and_changed_server_key_fail_closed() {
        let server_setup = generate_server_setup();
        let (password_file, _, server_public_key) = register(&server_setup);
        let started = client_login_start(b"wrong password").unwrap();
        let server_started = server_login_start(
            &server_setup,
            Some(&password_file),
            ACCOUNT,
            &started.request,
        )
        .unwrap();
        assert!(matches!(
            client_login_finish(
                &started.state,
                b"wrong password",
                ACCOUNT,
                &server_started.response,
                &server_public_key,
            ),
            Err(AuthProtocolError::Protocol)
        ));

        let started = client_login_start(PASSWORD).unwrap();
        let server_started = server_login_start(
            &server_setup,
            Some(&password_file),
            ACCOUNT,
            &started.request,
        )
        .unwrap();
        assert!(matches!(
            client_login_finish(
                &started.state,
                PASSWORD,
                ACCOUNT,
                &server_started.response,
                &[0; 32],
            ),
            Err(AuthProtocolError::ServerKeyChanged)
        ));
    }

    #[test]
    fn export_key_derivation_is_domain_separated_and_stable() {
        let export_key = vec![9_u8; 64];
        let first = derive_account_wrapping_key(export_key.clone()).unwrap();
        let second = derive_account_wrapping_key(export_key).unwrap();
        assert_eq!(first, second);
        assert_ne!(first, [9_u8; 32]);
    }

    #[test]
    fn serialized_server_setup_restores_the_same_public_key() {
        let setup = generate_server_setup();
        assert_eq!(
            server_static_public_key(&setup).unwrap(),
            server_static_public_key(&setup).unwrap()
        );
        assert!(server_static_public_key(&[0; 4]).is_err());
    }

    #[test]
    fn account_identifier_normalization_is_stable_and_rejects_malformed_values() {
        assert_eq!(
            account_credential_identifier(" Founder@Example.COM ").unwrap(),
            account_credential_identifier("founder@example.com").unwrap()
        );
        for malformed in ["", "missing-at.example", "@example.com", "name@"] {
            assert!(account_credential_identifier(malformed).is_err());
        }
    }
}

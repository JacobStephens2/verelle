//! Narrow, versioned cryptographic primitives for the client trust boundary.
//!
//! These primitives are covered by tests but are not a substitute for the
//! external key-lifecycle review required by plan gate OQ-9.

use aes_gcm::{
    Aes256Gcm, KeyInit, Nonce,
    aead::{Aead, Payload},
};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use hkdf::Hkdf;
use p256::{
    ecdsa::{Signature, SigningKey, signature::Signer},
    pkcs8::EncodePublicKey,
};
use rand::{RngCore, rngs::OsRng};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use thiserror::Error;
use zeroize::{Zeroize, ZeroizeOnDrop};

pub const ENVELOPE_VERSION: u8 = 1;
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;
const MAGIC: &[u8; 4] = b"VRL1";

#[derive(Debug, Error)]
pub enum CryptoError {
    #[error("invalid Argon2 parameters")]
    InvalidKdfParameters,
    #[error("key derivation failed")]
    KeyDerivation,
    #[error("envelope version {0} is unsupported")]
    UnsupportedVersion(u8),
    #[error("envelope key epoch does not match the expected epoch")]
    WrongEpoch,
    #[error("envelope is malformed")]
    MalformedEnvelope,
    #[error("authentication failed")]
    Authentication,
    #[error("recovery code is malformed")]
    MalformedRecoveryCode,
    #[error("wrapped key plaintext is malformed")]
    MalformedWrappedKey,
    #[error("recovery proof key could not be encoded")]
    RecoveryProofKey,
}

#[derive(Clone, Zeroize, ZeroizeOnDrop)]
pub struct SecretKey([u8; KEY_LEN]);

impl SecretKey {
    pub fn random() -> Self {
        let mut bytes = [0_u8; KEY_LEN];
        OsRng.fill_bytes(&mut bytes);
        Self(bytes)
    }

    pub fn from_bytes(bytes: [u8; KEY_LEN]) -> Self {
        Self(bytes)
    }

    pub fn expose(&self) -> &[u8; KEY_LEN] {
        &self.0
    }
}

impl std::fmt::Debug for SecretKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("SecretKey([REDACTED])")
    }
}

/// Separated client secrets derived with Argon2id and domain-specific HKDF
/// labels. `auth_key` is input to the reviewed PAKE/auth path only; it is not
/// a bearer credential and must never be transmitted or stored as-is.
#[derive(Clone, Zeroize, ZeroizeOnDrop)]
pub struct AccountSecrets {
    auth_key: [u8; KEY_LEN],
    wrapping_key: [u8; KEY_LEN],
}

impl std::fmt::Debug for AccountSecrets {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("AccountSecrets([REDACTED])")
    }
}

impl AccountSecrets {
    /// Available only for a reviewed challenge-response implementation. Do
    /// not send this value to the server or use it directly as a session key.
    pub fn auth_key(&self) -> SecretKey {
        SecretKey::from_bytes(self.auth_key)
    }

    pub fn wrapping_key(&self) -> SecretKey {
        SecretKey::from_bytes(self.wrapping_key)
    }
}

pub fn derive_account_secrets(
    password: &str,
    salt: &[u8; 16],
) -> Result<AccountSecrets, CryptoError> {
    let params =
        Params::new(64 * 1024, 3, 1, Some(64)).map_err(|_| CryptoError::InvalidKdfParameters)?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut root = [0_u8; 64];
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut root)
        .map_err(|_| CryptoError::KeyDerivation)?;
    let hkdf = Hkdf::<Sha256>::new(Some(b"verelle/account-separation/v1"), &root);
    let mut auth_key = [0_u8; KEY_LEN];
    let mut wrapping_key = [0_u8; KEY_LEN];
    hkdf.expand(b"authentication", &mut auth_key)
        .map_err(|_| CryptoError::KeyDerivation)?;
    hkdf.expand(b"account-data-key-wrap", &mut wrapping_key)
        .map_err(|_| CryptoError::KeyDerivation)?;
    root.zeroize();
    Ok(AccountSecrets {
        auth_key,
        wrapping_key,
    })
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EncryptedEnvelope {
    pub version: u8,
    pub key_epoch: u64,
    pub nonce: [u8; NONCE_LEN],
    pub ciphertext: Vec<u8>,
}

impl EncryptedEnvelope {
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut output = Vec::with_capacity(4 + 1 + 8 + NONCE_LEN + self.ciphertext.len());
        output.extend_from_slice(MAGIC);
        output.push(self.version);
        output.extend_from_slice(&self.key_epoch.to_be_bytes());
        output.extend_from_slice(&self.nonce);
        output.extend_from_slice(&self.ciphertext);
        output
    }

    pub fn from_bytes(bytes: &[u8]) -> Result<Self, CryptoError> {
        const HEADER_LEN: usize = 4 + 1 + 8 + NONCE_LEN;
        if bytes.len() < HEADER_LEN || &bytes[..4] != MAGIC {
            return Err(CryptoError::MalformedEnvelope);
        }
        let version = bytes[4];
        if version != ENVELOPE_VERSION {
            return Err(CryptoError::UnsupportedVersion(version));
        }
        let key_epoch = u64::from_be_bytes(
            bytes[5..13]
                .try_into()
                .map_err(|_| CryptoError::MalformedEnvelope)?,
        );
        let nonce = bytes[13..13 + NONCE_LEN]
            .try_into()
            .map_err(|_| CryptoError::MalformedEnvelope)?;
        let ciphertext = bytes[HEADER_LEN..].to_vec();
        if ciphertext.len() < 16 {
            return Err(CryptoError::MalformedEnvelope);
        }
        Ok(Self {
            version,
            key_epoch,
            nonce,
            ciphertext,
        })
    }
}

pub fn seal(
    key: &SecretKey,
    key_epoch: u64,
    context: &[u8],
    plaintext: &[u8],
) -> Result<EncryptedEnvelope, CryptoError> {
    let cipher = Aes256Gcm::new_from_slice(key.expose()).map_err(|_| CryptoError::KeyDerivation)?;
    let mut nonce = [0_u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce);
    let aad = associated_data(key_epoch, context);
    let ciphertext = cipher
        .encrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: plaintext,
                aad: &aad,
            },
        )
        .map_err(|_| CryptoError::Authentication)?;
    Ok(EncryptedEnvelope {
        version: ENVELOPE_VERSION,
        key_epoch,
        nonce,
        ciphertext,
    })
}

pub fn open(
    key: &SecretKey,
    expected_epoch: u64,
    context: &[u8],
    envelope: &EncryptedEnvelope,
) -> Result<Vec<u8>, CryptoError> {
    if envelope.version != ENVELOPE_VERSION {
        return Err(CryptoError::UnsupportedVersion(envelope.version));
    }
    if envelope.key_epoch != expected_epoch {
        return Err(CryptoError::WrongEpoch);
    }
    let cipher = Aes256Gcm::new_from_slice(key.expose()).map_err(|_| CryptoError::KeyDerivation)?;
    let aad = associated_data(expected_epoch, context);
    cipher
        .decrypt(
            Nonce::from_slice(&envelope.nonce),
            Payload {
                msg: &envelope.ciphertext,
                aad: &aad,
            },
        )
        .map_err(|_| CryptoError::Authentication)
}

/// Wrap one secret key under another with the same versioned envelope and AAD
/// rules used for operation encryption.
pub fn wrap_secret_key(
    wrapping_key: &SecretKey,
    key_epoch: u64,
    context: &[u8],
    key_to_wrap: &SecretKey,
) -> Result<EncryptedEnvelope, CryptoError> {
    seal(wrapping_key, key_epoch, context, key_to_wrap.expose())
}

pub fn unwrap_secret_key(
    wrapping_key: &SecretKey,
    expected_epoch: u64,
    context: &[u8],
    envelope: &EncryptedEnvelope,
) -> Result<SecretKey, CryptoError> {
    let plaintext = open(wrapping_key, expected_epoch, context, envelope)?;
    let bytes: [u8; KEY_LEN] = plaintext
        .try_into()
        .map_err(|_| CryptoError::MalformedWrappedKey)?;
    Ok(SecretKey::from_bytes(bytes))
}

fn associated_data(key_epoch: u64, context: &[u8]) -> Vec<u8> {
    let mut aad = Vec::with_capacity(4 + 1 + 8 + context.len());
    aad.extend_from_slice(MAGIC);
    aad.push(ENVELOPE_VERSION);
    aad.extend_from_slice(&key_epoch.to_be_bytes());
    aad.extend_from_slice(context);
    aad
}

/// A high-entropy recovery code. The rendered string is intended for offline
/// custody; neither it nor a reusable derivative belongs on the server.
#[derive(Clone, PartialEq, Eq, Zeroize, ZeroizeOnDrop)]
pub struct RecoveryCode(String);

impl std::fmt::Debug for RecoveryCode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("RecoveryCode([REDACTED])")
    }
}

impl RecoveryCode {
    pub fn generate() -> Self {
        let mut bytes = [0_u8; KEY_LEN];
        OsRng.fill_bytes(&mut bytes);
        let encoded = URL_SAFE_NO_PAD.encode(bytes);
        bytes.zeroize();
        Self(encoded)
    }

    pub fn parse(value: impl Into<String>) -> Result<Self, CryptoError> {
        let mut value = value.into();
        let Ok(mut decoded) = URL_SAFE_NO_PAD.decode(&value) else {
            value.zeroize();
            return Err(CryptoError::MalformedRecoveryCode);
        };
        let correct_length = decoded.len() == KEY_LEN;
        decoded.zeroize();
        if !correct_length {
            value.zeroize();
            return Err(CryptoError::MalformedRecoveryCode);
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn wrapping_key(&self) -> Result<SecretKey, CryptoError> {
        let mut decoded = URL_SAFE_NO_PAD
            .decode(&self.0)
            .map_err(|_| CryptoError::MalformedRecoveryCode)?;
        let hkdf = Hkdf::<Sha256>::new(Some(b"verelle/recovery/v1"), &decoded);
        let mut key = [0_u8; KEY_LEN];
        hkdf.expand(b"account-data-key-wrap", &mut key)
            .map_err(|_| CryptoError::KeyDerivation)?;
        decoded.zeroize();
        Ok(SecretKey::from_bytes(key))
    }
}

/// Returns the stable public recovery verifier for a random account data key.
/// The server stores only this public key and can therefore verify recovery
/// authorization without receiving the recovery code or account data key.
pub fn recovery_public_key(account_data_key: &SecretKey) -> Result<Vec<u8>, CryptoError> {
    let signing_key = recovery_signing_key(account_data_key)?;
    signing_key
        .verifying_key()
        .to_public_key_der()
        .map(|document| document.as_bytes().to_vec())
        .map_err(|_| CryptoError::RecoveryProofKey)
}

/// Signs a server challenge with a deterministic P-256 key derived from the
/// random account data key.
pub fn sign_recovery_message(
    account_data_key: &SecretKey,
    message: &[u8],
) -> Result<Vec<u8>, CryptoError> {
    let signing_key = recovery_signing_key(account_data_key)?;
    let signature: Signature = signing_key.sign(message);
    Ok(signature.to_bytes().to_vec())
}

fn recovery_signing_key(account_data_key: &SecretKey) -> Result<SigningKey, CryptoError> {
    for counter in 0_u8..=u8::MAX {
        let hkdf = Hkdf::<Sha256>::new(
            Some(b"verelle/account-recovery-proof/v1"),
            account_data_key.expose(),
        );
        let mut candidate = [0_u8; KEY_LEN];
        hkdf.expand(&[b'p', b'2', b'5', b'6', counter], &mut candidate)
            .map_err(|_| CryptoError::KeyDerivation)?;
        if let Ok(key) = SigningKey::from_bytes((&candidate).into()) {
            candidate.zeroize();
            return Ok(key);
        }
        candidate.zeroize();
    }
    Err(CryptoError::RecoveryProofKey)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn envelope_round_trips_and_binary_format_round_trips() {
        let key = SecretKey::random();
        let envelope = seal(&key, 7, b"couple/op", b"private observation").unwrap();
        let encoded = envelope.to_bytes();
        let decoded = EncryptedEnvelope::from_bytes(&encoded).unwrap();
        assert_eq!(decoded, envelope);
        assert_eq!(
            open(&key, 7, b"couple/op", &decoded).unwrap(),
            b"private observation"
        );
    }

    #[test]
    fn wrong_key_epoch_and_context_all_fail_closed() {
        let key = SecretKey::random();
        let wrong_key = SecretKey::random();
        let envelope = seal(&key, 2, b"correct", b"secret").unwrap();
        assert!(matches!(
            open(&key, 1, b"correct", &envelope),
            Err(CryptoError::WrongEpoch)
        ));
        assert!(matches!(
            open(&wrong_key, 2, b"correct", &envelope),
            Err(CryptoError::Authentication)
        ));
        assert!(matches!(
            open(&key, 2, b"wrong", &envelope),
            Err(CryptoError::Authentication)
        ));
    }

    #[test]
    fn password_derivation_is_separated_and_stable() {
        let first = derive_account_secrets("correct horse", &[9; 16]).unwrap();
        let second = derive_account_secrets("correct horse", &[9; 16]).unwrap();
        assert_eq!(first.auth_key().expose(), second.auth_key().expose());
        assert_eq!(
            first.wrapping_key().expose(),
            second.wrapping_key().expose()
        );
        assert_ne!(first.auth_key().expose(), first.wrapping_key().expose());
    }

    #[test]
    fn recovery_code_can_wrap_without_server_knowledge() {
        let code = RecoveryCode::generate();
        let parsed = RecoveryCode::parse(code.as_str()).unwrap();
        assert_eq!(
            code.wrapping_key().unwrap().expose(),
            parsed.wrapping_key().unwrap().expose()
        );
        let data_key = SecretKey::random();
        let recovery_key = code.wrapping_key().unwrap();
        let wrapped =
            wrap_secret_key(&recovery_key, 1, b"account/recovery-wrap", &data_key).unwrap();
        let recovered = unwrap_secret_key(
            &parsed.wrapping_key().unwrap(),
            1,
            b"account/recovery-wrap",
            &wrapped,
        )
        .unwrap();
        assert_eq!(recovered.expose(), data_key.expose());
        assert_eq!(format!("{code:?}"), "RecoveryCode([REDACTED])");
    }

    #[test]
    fn recovery_proof_key_is_stable_and_signs() {
        use p256::{
            ecdsa::{Signature, VerifyingKey, signature::Verifier},
            pkcs8::DecodePublicKey,
        };

        let account_key = SecretKey::from_bytes([31_u8; 32]);
        let first = recovery_public_key(&account_key).unwrap();
        let second = recovery_public_key(&account_key).unwrap();
        assert_eq!(first, second);
        let signature = sign_recovery_message(&account_key, b"recovery challenge").unwrap();
        let verifying_key = VerifyingKey::from_public_key_der(&first).unwrap();
        verifying_key
            .verify(
                b"recovery challenge",
                &Signature::from_slice(&signature).unwrap(),
            )
            .unwrap();
    }
}

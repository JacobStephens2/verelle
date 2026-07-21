use crate::{
    account_transport, encrypted_storage,
    sync_runtime::{ReviewedSyncSession, SyncSummary, sync_once},
    sync_state::BrowserSyncState,
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use js_sys::Date;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;
use verelle_api::{
    BillingInterval, CheckoutSessionRequest, CoupleInviteCreateRequest, CoupleInviteRedeemRequest,
    EntitlementResponse, HEALTH_DATA_CONSENT_VERSION, HealthDataConsent, LoginFinishRequest,
    LoginStartRequest, OpaqueMessage, RecoveryFinishRequest, RecoveryStartRequest,
    RegistrationFinishRequest, RegistrationStartRequest, login_device_proof_message,
    recovery_account_proof_message, registration_device_proof_message,
};
use verelle_auth::{
    account_credential_identifier, client_login_finish, client_login_start,
    client_registration_finish, client_registration_start, derive_account_wrapping_key,
    normalize_account_identifier,
};
use verelle_core::{
    Observation, RecordKey, VersionStamp, observations_to_csv, observations_to_json,
};
use verelle_crypto::{
    EncryptedEnvelope, RecoveryCode, SecretKey, recovery_public_key, sign_recovery_message,
    unwrap_secret_key, wrap_secret_key,
};
use zeroize::{Zeroize, Zeroizing};

const VAULT_VERSION: u8 = 1;
const KEY_EPOCH: u64 = 1;
const COUPLE_INVITE_VERSION: u8 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CoupleInviteCode {
    version: u8,
    invite_id: Uuid,
    dataset_id: Uuid,
    key_epoch: u64,
    secret_base64url: String,
    wrapped_dataset_key_base64url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingCoupleAcceptance {
    request: CoupleInviteRedeemRequest,
    target_dataset_id: Uuid,
    key_epoch: u64,
    dataset_key_base64url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserAccount {
    pub email: String,
    pub account_id: Option<Uuid>,
    pub device_id: Uuid,
    pub dataset_id: Uuid,
    pub server_public_key: String,
    pub account_data_key: String,
    pub dataset_key: String,
    pub bearer_token: Option<String>,
    pub session_expires_at_unix_seconds: i64,
    pub recovery_code_pending_acknowledgement: Option<String>,
    pub health_data_consent_version: String,
    #[serde(default)]
    pub pending_registration: Option<RegistrationFinishRequest>,
    #[serde(default)]
    pub pending_recovery: Option<RecoveryFinishRequest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserVault {
    pub version: u8,
    pub local_observations: Vec<Observation>,
    pub account: Option<BrowserAccount>,
    pub sync: BrowserSyncState,
    #[serde(default)]
    pub pending_redactions: Vec<Uuid>,
    #[serde(default)]
    pub pending_couple_acceptance: Option<PendingCoupleAcceptance>,
}

impl Default for BrowserVault {
    fn default() -> Self {
        Self {
            version: VAULT_VERSION,
            local_observations: Vec::new(),
            account: None,
            sync: BrowserSyncState::default(),
            pending_redactions: Vec::new(),
            pending_couple_acceptance: None,
        }
    }
}

impl BrowserVault {
    pub fn observations(&self) -> Result<Vec<Observation>, String> {
        if self.account.is_some() {
            self.sync
                .materialized_observations()
                .map_err(|_| "The encrypted chart could not be rebuilt".to_owned())
        } else {
            Ok(self.local_observations.clone())
        }
    }

    pub fn active_session(&self) -> bool {
        self.account
            .as_ref()
            .is_some_and(BrowserAccount::active_session)
    }

    pub fn acknowledge_recovery_code(&mut self) {
        if let Some(account) = self.account.as_mut() {
            account.recovery_code_pending_acknowledgement = None;
        }
    }

    pub fn append_observation(&mut self, observation: Observation) -> Result<(), String> {
        let Some(account) = self.account.as_ref() else {
            crate::model::upsert_observation(&mut self.local_observations, observation);
            return Ok(());
        };
        let dataset_key = account.dataset_key()?;
        self.sync
            .append_observation(&dataset_key, account.dataset_id, KEY_EPOCH, observation)
            .map_err(|_| "The observation could not be encrypted".to_owned())?;
        Ok(())
    }

    pub fn delete_observation(
        &mut self,
        record_key: RecordKey,
        version: VersionStamp,
    ) -> Result<(), String> {
        let Some(account) = self.account.as_ref() else {
            self.local_observations
                .retain(|observation| observation.record_key() != record_key);
            return Ok(());
        };
        let dataset_key = account.dataset_key()?;
        let replaced_ids = self
            .sync
            .operations
            .iter()
            .filter(|operation| operation.record_key == record_key)
            .filter_map(|operation| match operation.mutation {
                verelle_sync::OperationMutation::Upsert { .. } => Some(operation.op_id),
                verelle_sync::OperationMutation::Tombstone => None,
            })
            .collect::<Vec<_>>();
        self.sync
            .append_tombstone(
                &dataset_key,
                account.dataset_id,
                KEY_EPOCH,
                record_key,
                version,
            )
            .map_err(|_| "The deletion could not be encrypted".to_owned())?;
        self.pending_redactions.extend(replaced_ids);
        self.pending_redactions.sort_unstable();
        self.pending_redactions.dedup();
        Ok(())
    }

    pub async fn sync(&mut self) -> Result<SyncSummary, String> {
        let session = self
            .account
            .as_ref()
            .ok_or_else(|| "Sign in before synchronizing".to_owned())?
            .sync_session()?;
        sync_once(&mut self.sync, &session)
            .await
            .map_err(|error| error.to_string())
    }

    pub async fn finish_pending_redactions(&mut self) -> Result<(), String> {
        if self.pending_redactions.is_empty() {
            return Ok(());
        }
        let account = self
            .account
            .as_ref()
            .ok_or_else(|| "The account enrollment is unavailable".to_owned())?;
        let token = account
            .bearer_token
            .as_deref()
            .ok_or_else(|| "Sign in before completing a deletion".to_owned())?;
        let pending = self.pending_redactions.clone();
        for chunk in pending.chunks(verelle_api::MAX_REDACTION_OPERATIONS) {
            account_transport::redact_operations(token, account.dataset_id, chunk).await?;
        }
        self.sync.remove_redacted_plaintext(&pending);
        self.pending_redactions.clear();
        Ok(())
    }

    pub async fn create_couple_invite(&self) -> Result<(String, i64), String> {
        let account = self
            .account
            .as_ref()
            .ok_or_else(|| "Sign in before inviting a partner".to_owned())?;
        let token = account
            .bearer_token
            .as_deref()
            .ok_or_else(|| "Sign in before inviting a partner".to_owned())?;
        let invite_id = Uuid::new_v4();
        let secret = SecretKey::random();
        let wrapped_dataset_key = wrap_secret_key(
            &secret,
            KEY_EPOCH,
            &invite_context(invite_id, account.dataset_id),
            &account.dataset_key()?,
        )
        .map_err(|_| "The chart invitation could not be encrypted".to_owned())?;
        let verifier = invite_verifier(invite_id, &secret);
        let code = CoupleInviteCode {
            version: COUPLE_INVITE_VERSION,
            invite_id,
            dataset_id: account.dataset_id,
            key_epoch: KEY_EPOCH,
            secret_base64url: URL_SAFE_NO_PAD.encode(secret.expose()),
            wrapped_dataset_key_base64url: URL_SAFE_NO_PAD.encode(wrapped_dataset_key.to_bytes()),
        };
        let response = account_transport::create_couple_invite(
            token,
            &CoupleInviteCreateRequest {
                invite_id,
                dataset_id: account.dataset_id,
                verifier: OpaqueMessage::from_bytes(&verifier),
            },
        )
        .await?;
        if response.invite_id != invite_id || response.dataset_id != account.dataset_id {
            return Err("The account service returned a different invitation".to_owned());
        }
        let code = serde_json::to_vec(&code)
            .map_err(|_| "The chart invitation could not be encoded".to_owned())?;
        Ok((
            URL_SAFE_NO_PAD.encode(code),
            response.expires_at_unix_seconds,
        ))
    }

    pub async fn create_checkout(&self, interval: BillingInterval) -> Result<String, String> {
        let token = self
            .account
            .as_ref()
            .and_then(|account| account.bearer_token.as_deref())
            .ok_or_else(|| "Sign in before subscribing".to_owned())?;
        Ok(
            account_transport::create_checkout(token, &CheckoutSessionRequest { interval })
                .await?
                .checkout_url,
        )
    }

    pub async fn entitlement(&self) -> Result<EntitlementResponse, String> {
        let token = self
            .account
            .as_ref()
            .and_then(|account| account.bearer_token.as_deref())
            .ok_or_else(|| "Sign in to check the subscription".to_owned())?;
        account_transport::entitlement(token).await
    }

    pub async fn accept_couple_invite(&mut self, invite_code: String) -> Result<(), String> {
        if self.pending_couple_acceptance.is_some() {
            return self.finish_pending_couple_acceptance().await;
        }
        if !self.observations()?.is_empty()
            || !self.sync.operations.is_empty()
            || !self.sync.outbox.is_empty()
        {
            return Err(
                "An invitation can only replace an empty chart; export and delete entries first"
                    .to_owned(),
            );
        }
        let mut code_bytes = URL_SAFE_NO_PAD
            .decode(invite_code.trim())
            .map_err(|_| "The chart invitation is invalid or expired".to_owned())?;
        let code: CoupleInviteCode = serde_json::from_slice(&code_bytes)
            .map_err(|_| "The chart invitation is invalid or expired".to_owned())?;
        code_bytes.zeroize();
        if code.version != COUPLE_INVITE_VERSION
            || code.invite_id.is_nil()
            || code.dataset_id.is_nil()
            || code.key_epoch != KEY_EPOCH
        {
            return Err("The chart invitation is invalid or expired".to_owned());
        }
        let secret = decode_secret_key(&code.secret_base64url)
            .map_err(|_| "The chart invitation is invalid or expired".to_owned())?;
        let wrapped = EncryptedEnvelope::from_bytes(
            &URL_SAFE_NO_PAD
                .decode(&code.wrapped_dataset_key_base64url)
                .map_err(|_| "The chart invitation is invalid or expired".to_owned())?,
        )
        .map_err(|_| "The chart invitation is invalid or expired".to_owned())?;
        let dataset_key = unwrap_secret_key(
            &secret,
            code.key_epoch,
            &invite_context(code.invite_id, code.dataset_id),
            &wrapped,
        )
        .map_err(|_| "The chart invitation is invalid or expired".to_owned())?;
        let account = self
            .account
            .as_ref()
            .ok_or_else(|| "Sign in before accepting an invitation".to_owned())?;
        if !account.active_session() {
            return Err("Sign in before accepting an invitation".to_owned());
        }
        let account_data_key = decode_secret_key(&account.account_data_key)?;
        let account_wrap = wrap_secret_key(
            &account_data_key,
            code.key_epoch,
            b"dataset/account-wrap",
            &dataset_key,
        )
        .map_err(|_| "The shared chart key could not be protected".to_owned())?;
        self.pending_couple_acceptance = Some(PendingCoupleAcceptance {
            request: CoupleInviteRedeemRequest {
                invite_id: code.invite_id,
                verifier: OpaqueMessage::from_bytes(&invite_verifier(code.invite_id, &secret)),
                wrapped_dataset_key: OpaqueMessage::from_bytes(&account_wrap.to_bytes()),
            },
            target_dataset_id: code.dataset_id,
            key_epoch: code.key_epoch,
            dataset_key_base64url: URL_SAFE_NO_PAD.encode(dataset_key.expose()),
        });
        save_vault(self).await?;
        self.finish_pending_couple_acceptance().await
    }

    async fn finish_pending_couple_acceptance(&mut self) -> Result<(), String> {
        let pending = self
            .pending_couple_acceptance
            .clone()
            .ok_or_else(|| "No chart invitation is pending".to_owned())?;
        let account = self
            .account
            .as_ref()
            .ok_or_else(|| "The account enrollment is unavailable".to_owned())?;
        let token = account
            .bearer_token
            .as_deref()
            .ok_or_else(|| "Sign in to finish accepting the invitation".to_owned())?;
        let response = account_transport::redeem_couple_invite(token, &pending.request).await?;
        if response.invite_id != pending.request.invite_id
            || response.dataset_id != pending.target_dataset_id
            || response.key_epoch != pending.key_epoch
        {
            return Err("The account service returned a different shared chart".to_owned());
        }
        let account = self
            .account
            .as_mut()
            .ok_or_else(|| "The account enrollment is unavailable".to_owned())?;
        account.dataset_id = pending.target_dataset_id;
        account.dataset_key = pending.dataset_key_base64url;
        self.sync = BrowserSyncState::default();
        self.pending_redactions.clear();
        self.pending_couple_acceptance = None;
        save_vault(self).await
    }

    pub fn export_json(&self) -> Result<String, String> {
        observations_to_json(&self.observations()?)
            .map_err(|_| "The JSON export could not be created".to_owned())
    }

    pub fn export_csv(&self) -> Result<String, String> {
        observations_to_csv(&self.observations()?)
            .map_err(|_| "The CSV export could not be created".to_owned())
    }
}

impl BrowserAccount {
    pub fn active_session(&self) -> bool {
        self.bearer_token.is_some() && self.session_expires_at_unix_seconds > current_unix_seconds()
    }

    fn dataset_key(&self) -> Result<SecretKey, String> {
        decode_secret_key(&self.dataset_key)
    }

    fn sync_session(&self) -> Result<ReviewedSyncSession, String> {
        if !self.active_session() {
            return Err("The account session has expired. Sign in again".to_owned());
        }
        Ok(ReviewedSyncSession {
            dataset_id: self.dataset_id,
            bearer_token: self
                .bearer_token
                .clone()
                .ok_or_else(|| "The account session is unavailable".to_owned())?,
            dataset_key: self.dataset_key()?,
            key_epoch: KEY_EPOCH,
        })
    }
}

pub async fn load_vault() -> Result<BrowserVault, String> {
    let Some(value) = encrypted_storage::load().await? else {
        return Ok(BrowserVault::default());
    };
    if let Ok(mut vault) = serde_json::from_str::<BrowserVault>(&value) {
        if vault.version != VAULT_VERSION {
            return Err("The browser vault version is unsupported".to_owned());
        }
        if vault.pending_couple_acceptance.is_some() && vault.active_session() {
            let _ = vault.finish_pending_couple_acceptance().await;
        }
        return Ok(vault);
    }
    let observations = serde_json::from_str::<Vec<Observation>>(&value)
        .map_err(|_| "Stored encrypted browser data is invalid".to_owned())?;
    Ok(BrowserVault {
        local_observations: observations,
        ..BrowserVault::default()
    })
}

pub async fn save_vault(vault: &BrowserVault) -> Result<(), String> {
    let value = serde_json::to_string(vault)
        .map_err(|_| "The encrypted browser vault could not be encoded".to_owned())?;
    encrypted_storage::save(&value).await
}

#[allow(clippy::too_many_lines)] // Keep the audited enrollment sequence linear and reviewable.
pub async fn register(
    mut vault: BrowserVault,
    email: String,
    password: String,
) -> Result<BrowserVault, String> {
    let mut password = Zeroizing::new(password);
    validate_password(password.as_str())?;
    if vault.account.is_some() {
        return Err("This browser already has an enrolled account".to_owned());
    }
    if !vault.local_observations.is_empty() {
        return Err("Clear the local preview before creating a real encrypted account".to_owned());
    }
    let email = normalize_account_identifier(&email)
        .map_err(|_| "Enter a valid email address".to_owned())?;
    let credential_identifier = account_credential_identifier(&email)
        .map_err(|_| "Enter a valid email address".to_owned())?;
    let registration = client_registration_start(password.as_bytes())
        .map_err(|_| "Secure registration could not start".to_owned())?;
    let started = account_transport::registration_start(&RegistrationStartRequest {
        account_identifier: email.clone(),
        registration_request: OpaqueMessage::from_bytes(&registration.request),
    })
    .await?;
    let finished = client_registration_finish(
        &registration.state,
        password.as_bytes(),
        &credential_identifier,
        &started
            .registration_response
            .decode()
            .map_err(|_| "The registration response is invalid".to_owned())?,
    )
    .map_err(|_| "Secure registration could not finish".to_owned())?;

    let device_id = Uuid::new_v4();
    let dataset_id = Uuid::new_v4();
    let device_public_key = encrypted_storage::public_device_key().await?;
    let device_proof =
        registration_device_proof_message(started.flow_id, device_id, dataset_id, &finished.upload);
    let device_signature =
        encrypted_storage::sign_device(&URL_SAFE_NO_PAD.encode(device_proof)).await?;
    let password_wrapping_key = SecretKey::from_bytes(
        derive_account_wrapping_key(finished.export_key)
            .map_err(|_| "The account wrapping key could not be derived".to_owned())?,
    );
    let account_data_key = SecretKey::random();
    let dataset_key = SecretKey::random();
    let recovery_code = RecoveryCode::generate();
    let wrapped_account_key = wrap_secret_key(
        &password_wrapping_key,
        KEY_EPOCH,
        b"account/password-wrap",
        &account_data_key,
    )
    .map_err(|_| "The account key could not be protected".to_owned())?;
    let wrapped_recovery_key = wrap_secret_key(
        &recovery_code
            .wrapping_key()
            .map_err(|_| "The recovery key could not be derived".to_owned())?,
        KEY_EPOCH,
        b"account/recovery-wrap",
        &account_data_key,
    )
    .map_err(|_| "The recovery copy could not be protected".to_owned())?;
    let wrapped_dataset_key = wrap_secret_key(
        &account_data_key,
        KEY_EPOCH,
        b"dataset/account-wrap",
        &dataset_key,
    )
    .map_err(|_| "The chart key could not be protected".to_owned())?;
    let recovery_public_key = recovery_public_key(&account_data_key)
        .map_err(|_| "The recovery verifier could not be created".to_owned())?;

    let sync = BrowserSyncState::default();
    vault.local_observations.clear();
    vault.sync = sync;
    let finish_request = RegistrationFinishRequest {
        flow_id: started.flow_id,
        device_id,
        dataset_id,
        registration_upload: OpaqueMessage::from_bytes(&finished.upload),
        device_public_key: OpaqueMessage {
            message: device_public_key,
        },
        device_signature: OpaqueMessage {
            message: device_signature,
        },
        wrapped_account_key: OpaqueMessage::from_bytes(&wrapped_account_key.to_bytes()),
        recovery_wrapped_account_key: OpaqueMessage::from_bytes(&wrapped_recovery_key.to_bytes()),
        recovery_public_key: OpaqueMessage::from_bytes(&recovery_public_key),
        wrapped_dataset_key: OpaqueMessage::from_bytes(&wrapped_dataset_key.to_bytes()),
        health_data_consent: HealthDataConsent {
            policy_version: HEALTH_DATA_CONSENT_VERSION.to_owned(),
            affirmative: true,
        },
    };
    vault.account = Some(BrowserAccount {
        email: email.clone(),
        account_id: None,
        device_id,
        dataset_id,
        server_public_key: URL_SAFE_NO_PAD.encode(&finished.server_public_key),
        account_data_key: URL_SAFE_NO_PAD.encode(account_data_key.expose()),
        dataset_key: URL_SAFE_NO_PAD.encode(dataset_key.expose()),
        bearer_token: None,
        session_expires_at_unix_seconds: 0,
        recovery_code_pending_acknowledgement: Some(recovery_code.as_str().to_owned()),
        health_data_consent_version: HEALTH_DATA_CONSENT_VERSION.to_owned(),
        pending_registration: Some(finish_request.clone()),
        pending_recovery: None,
    });
    save_vault(&vault).await?;

    let account = account_transport::registration_finish(&finish_request).await?;
    if account.device_id != device_id || account.dataset_id != dataset_id {
        return Err("The account service returned different enrollment identifiers".to_owned());
    }
    if let Some(stored) = vault.account.as_mut() {
        stored.account_id = Some(account.account_id);
        stored.pending_registration = None;
    }
    login(&mut vault, &mut password).await?;
    save_vault(&vault).await?;
    Ok(vault)
}

pub async fn login(vault: &mut BrowserVault, password: &mut String) -> Result<(), String> {
    let password = Zeroizing::new(std::mem::take(password));
    validate_password(password.as_str())?;
    resume_pending_recovery(vault).await?;
    resume_pending_registration(vault).await;
    let account = vault.account.as_ref().ok_or_else(|| {
        "This browser has no enrolled device. Create an account here first".to_owned()
    })?;
    let email = account.email.clone();
    let device_id = account.device_id;
    let expected_server_key = URL_SAFE_NO_PAD
        .decode(&account.server_public_key)
        .map_err(|_| "The pinned server key is invalid".to_owned())?;
    let credential_identifier = account_credential_identifier(&email)
        .map_err(|_| "The enrolled email is invalid".to_owned())?;
    let login = client_login_start(password.as_bytes())
        .map_err(|_| "Secure sign-in could not start".to_owned())?;
    let started = account_transport::login_start(&LoginStartRequest {
        account_identifier: email,
        device_id,
        credential_request: OpaqueMessage::from_bytes(&login.request),
    })
    .await?;
    let finished = client_login_finish(
        &login.state,
        password.as_bytes(),
        &credential_identifier,
        &started
            .credential_response
            .decode()
            .map_err(|_| "The sign-in response is invalid".to_owned())?,
        &expected_server_key,
    )
    .map_err(|_| "The email or password was not accepted".to_owned())?;
    let challenge = started
        .device_challenge
        .decode()
        .map_err(|_| "The device challenge is invalid".to_owned())?;
    let proof = login_device_proof_message(started.flow_id, &challenge);
    let signature = encrypted_storage::sign_device(&URL_SAFE_NO_PAD.encode(proof)).await?;
    let session = account_transport::login_finish(&LoginFinishRequest {
        flow_id: started.flow_id,
        credential_finalization: OpaqueMessage::from_bytes(&finished.finalization),
        device_id,
        device_signature: OpaqueMessage { message: signature },
    })
    .await?;
    let account = vault
        .account
        .as_mut()
        .ok_or_else(|| "The enrolled account disappeared".to_owned())?;
    if session.device_id != account.device_id {
        return Err("The account service returned a different device".to_owned());
    }
    if account
        .account_id
        .is_some_and(|value| value != session.account_id)
    {
        return Err("The account service returned a different account".to_owned());
    }
    account.account_id = Some(session.account_id);
    account.pending_registration = None;
    account.bearer_token = Some(session.access_token.message);
    account.session_expires_at_unix_seconds = session.expires_at_unix_seconds;
    Ok(())
}

#[allow(clippy::too_many_lines)]
pub async fn recover(
    mut vault: BrowserVault,
    email: String,
    recovery_code: String,
    new_password: String,
) -> Result<BrowserVault, String> {
    if vault.account.is_some() {
        return Err("This browser already has an enrolled account".to_owned());
    }
    if !vault.local_observations.is_empty() {
        return Err("Clear the local preview before recovering an account".to_owned());
    }
    let mut new_password = Zeroizing::new(new_password);
    validate_password(new_password.as_str())?;
    let email = normalize_account_identifier(&email)
        .map_err(|_| "Enter a valid email address".to_owned())?;
    let credential_identifier = account_credential_identifier(&email)
        .map_err(|_| "Enter a valid email address".to_owned())?;
    let recovery_code = RecoveryCode::parse(recovery_code)
        .map_err(|_| "The email or recovery code was not accepted".to_owned())?;
    let registration = client_registration_start(new_password.as_bytes())
        .map_err(|_| "Secure recovery could not start".to_owned())?;
    let started = account_transport::recovery_start(&RecoveryStartRequest {
        account_identifier: email.clone(),
        registration_request: OpaqueMessage::from_bytes(&registration.request),
    })
    .await?;
    let finished = client_registration_finish(
        &registration.state,
        new_password.as_bytes(),
        &credential_identifier,
        &started
            .registration_response
            .decode()
            .map_err(|_| "The recovery response is invalid".to_owned())?,
    )
    .map_err(|_| "Secure recovery could not finish".to_owned())?;
    let account_wrap = EncryptedEnvelope::from_bytes(
        &started
            .recovery_wrapped_account_key
            .decode()
            .map_err(|_| "The recovery account key is invalid".to_owned())?,
    )
    .map_err(|_| "The recovery account key is invalid".to_owned())?;
    let account_data_key = unwrap_secret_key(
        &recovery_code
            .wrapping_key()
            .map_err(|_| "The email or recovery code was not accepted".to_owned())?,
        KEY_EPOCH,
        b"account/recovery-wrap",
        &account_wrap,
    )
    .map_err(|_| "The email or recovery code was not accepted".to_owned())?;
    let dataset_wrap = EncryptedEnvelope::from_bytes(
        &started
            .wrapped_dataset_key
            .decode()
            .map_err(|_| "The recovered chart key is invalid".to_owned())?,
    )
    .map_err(|_| "The recovered chart key is invalid".to_owned())?;
    let dataset_key = unwrap_secret_key(
        &account_data_key,
        KEY_EPOCH,
        b"dataset/account-wrap",
        &dataset_wrap,
    )
    .map_err(|_| "The recovered chart key could not be opened".to_owned())?;

    let device_id = Uuid::new_v4();
    let device_public_key = encrypted_storage::public_device_key().await?;
    let device_proof = registration_device_proof_message(
        started.flow_id,
        device_id,
        started.dataset_id,
        &finished.upload,
    );
    let device_signature =
        encrypted_storage::sign_device(&URL_SAFE_NO_PAD.encode(device_proof)).await?;
    let password_wrapping_key = SecretKey::from_bytes(
        derive_account_wrapping_key(finished.export_key)
            .map_err(|_| "The account wrapping key could not be derived".to_owned())?,
    );
    let wrapped_account_key = wrap_secret_key(
        &password_wrapping_key,
        KEY_EPOCH,
        b"account/password-wrap",
        &account_data_key,
    )
    .map_err(|_| "The account key could not be protected".to_owned())?;
    let new_recovery_code = RecoveryCode::generate();
    let wrapped_recovery_key = wrap_secret_key(
        &new_recovery_code
            .wrapping_key()
            .map_err(|_| "The new recovery key could not be derived".to_owned())?,
        KEY_EPOCH,
        b"account/recovery-wrap",
        &account_data_key,
    )
    .map_err(|_| "The new recovery copy could not be protected".to_owned())?;
    let wrapped_dataset_key = wrap_secret_key(
        &account_data_key,
        KEY_EPOCH,
        b"dataset/account-wrap",
        &dataset_key,
    )
    .map_err(|_| "The chart key could not be protected".to_owned())?;
    let mut finish_request = RecoveryFinishRequest {
        flow_id: started.flow_id,
        device_id,
        dataset_id: started.dataset_id,
        registration_upload: OpaqueMessage::from_bytes(&finished.upload),
        device_public_key: OpaqueMessage {
            message: device_public_key,
        },
        device_signature: OpaqueMessage {
            message: device_signature,
        },
        recovery_signature: OpaqueMessage::from_bytes(&[1]),
        wrapped_account_key: OpaqueMessage::from_bytes(&wrapped_account_key.to_bytes()),
        recovery_wrapped_account_key: OpaqueMessage::from_bytes(&wrapped_recovery_key.to_bytes()),
        wrapped_dataset_key: OpaqueMessage::from_bytes(&wrapped_dataset_key.to_bytes()),
    };
    let challenge = started
        .recovery_challenge
        .decode()
        .map_err(|_| "The recovery challenge is invalid".to_owned())?;
    let recovery_proof = recovery_account_proof_message(&finish_request, &challenge);
    finish_request.recovery_signature = OpaqueMessage::from_bytes(
        &sign_recovery_message(&account_data_key, &recovery_proof)
            .map_err(|_| "The recovery authorization could not be signed".to_owned())?,
    );

    vault.sync = BrowserSyncState::default();
    vault.account = Some(BrowserAccount {
        email: email.clone(),
        account_id: None,
        device_id,
        dataset_id: started.dataset_id,
        server_public_key: URL_SAFE_NO_PAD.encode(&finished.server_public_key),
        account_data_key: URL_SAFE_NO_PAD.encode(account_data_key.expose()),
        dataset_key: URL_SAFE_NO_PAD.encode(dataset_key.expose()),
        bearer_token: None,
        session_expires_at_unix_seconds: 0,
        recovery_code_pending_acknowledgement: Some(new_recovery_code.as_str().to_owned()),
        health_data_consent_version: HEALTH_DATA_CONSENT_VERSION.to_owned(),
        pending_registration: None,
        pending_recovery: Some(finish_request.clone()),
    });
    save_vault(&vault).await?;
    let recovered = account_transport::recovery_finish(&finish_request).await?;
    if recovered.device_id != device_id || recovered.dataset_id != started.dataset_id {
        return Err("The account service returned different recovery identifiers".to_owned());
    }
    if let Some(account) = vault.account.as_mut() {
        account.account_id = Some(recovered.account_id);
        account.pending_recovery = None;
    }
    login(&mut vault, &mut new_password).await?;
    save_vault(&vault).await?;
    Ok(vault)
}

pub async fn logout(vault: &mut BrowserVault) -> Result<(), String> {
    let account = vault
        .account
        .as_mut()
        .ok_or_else(|| "No account is enrolled".to_owned())?;
    if let Some(token) = account.bearer_token.as_deref() {
        account_transport::logout(token).await?;
    }
    account.bearer_token = None;
    account.session_expires_at_unix_seconds = 0;
    save_vault(vault).await
}

pub async fn delete_account(vault: &BrowserVault) -> Result<(Uuid, bool), String> {
    let account = vault
        .account
        .as_ref()
        .ok_or_else(|| "No account is enrolled".to_owned())?;
    let token = account
        .bearer_token
        .as_deref()
        .ok_or_else(|| "Sign in before deleting the account".to_owned())?;
    let deletion = account_transport::delete_account(token).await?;
    let local_destroyed = encrypted_storage::destroy().await.is_ok();
    Ok((deletion.deletion_id, local_destroyed))
}

pub async fn abandon_pending_registration(vault: &BrowserVault) -> Result<BrowserVault, String> {
    let account = vault
        .account
        .as_ref()
        .ok_or_else(|| "No browser enrollment is pending".to_owned())?;
    if account.account_id.is_some() || account.pending_registration.is_none() {
        return Err("The completed account cannot be reset as an interrupted signup".to_owned());
    }
    encrypted_storage::destroy().await?;
    let reset = BrowserVault::default();
    save_vault(&reset).await?;
    Ok(reset)
}

async fn resume_pending_registration(vault: &mut BrowserVault) {
    let Some(request) = vault
        .account
        .as_ref()
        .and_then(|account| account.pending_registration.clone())
    else {
        return;
    };
    let Ok(response) = account_transport::registration_finish(&request).await else {
        return;
    };
    if response.device_id != request.device_id || response.dataset_id != request.dataset_id {
        return;
    }
    if let Some(account) = vault.account.as_mut() {
        account.account_id = Some(response.account_id);
        account.pending_registration = None;
    }
    let _ = save_vault(vault).await;
}

async fn resume_pending_recovery(vault: &mut BrowserVault) -> Result<(), String> {
    let Some(request) = vault
        .account
        .as_ref()
        .and_then(|account| account.pending_recovery.clone())
    else {
        return Ok(());
    };
    let response = account_transport::recovery_finish(&request).await?;
    if response.device_id != request.device_id || response.dataset_id != request.dataset_id {
        return Err("The account service returned different recovery identifiers".to_owned());
    }
    if let Some(account) = vault.account.as_mut() {
        account.account_id = Some(response.account_id);
        account.pending_recovery = None;
    }
    save_vault(vault).await
}

fn validate_password(password: &str) -> Result<(), String> {
    if !(12..=1024).contains(&password.len()) {
        return Err("Use a password between 12 and 1024 characters".to_owned());
    }
    Ok(())
}

fn decode_secret_key(value: &str) -> Result<SecretKey, String> {
    let mut bytes = URL_SAFE_NO_PAD
        .decode(value)
        .map_err(|_| "An encrypted account key is invalid".to_owned())?;
    if bytes.len() != 32 {
        bytes.zeroize();
        return Err("An encrypted account key has the wrong size".to_owned());
    }
    let mut key = [0_u8; 32];
    key.copy_from_slice(&bytes);
    bytes.zeroize();
    Ok(SecretKey::from_bytes(key))
}

fn current_unix_seconds() -> i64 {
    #[allow(clippy::cast_possible_truncation)]
    let seconds = (Date::now() / 1000.0) as i64;
    seconds
}

fn invite_context(invite_id: Uuid, dataset_id: Uuid) -> Vec<u8> {
    let mut context = b"couple/invite-wrap/v1".to_vec();
    context.extend_from_slice(invite_id.as_bytes());
    context.extend_from_slice(dataset_id.as_bytes());
    context
}

fn invite_verifier(invite_id: Uuid, secret: &SecretKey) -> [u8; 32] {
    let mut digest = Sha256::new();
    digest.update(b"verelle/couple-invite-verifier/v1");
    digest.update(invite_id.as_bytes());
    digest.update(secret.expose());
    digest.finalize().into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vault_defaults_to_an_unenrolled_empty_state() {
        let vault = BrowserVault::default();
        assert!(vault.account.is_none());
        assert!(!vault.active_session());
        assert!(vault.observations().unwrap().is_empty());
    }
}

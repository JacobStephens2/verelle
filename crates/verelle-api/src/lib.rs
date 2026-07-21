//! Versioned, content-blind HTTP contract shared by every Verelle surface.
//!
//! Authentication messages are opaque byte strings. Sync messages expose only
//! dataset/operation identifiers, key epochs, cursors, and encrypted envelopes.
//! No type in this crate can carry a chart record key or observation plaintext.

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;
use uuid::Uuid;
use verelle_sync::{SequencedTransportOp, TransportOp, TransportPage};

pub const API_PREFIX: &str = "/api/v1";
pub const REGISTRATION_START_PATH: &str = "/api/v1/accounts/opaque/start";
pub const REGISTRATION_FINISH_PATH: &str = "/api/v1/accounts/opaque/finish";
pub const LOGIN_START_PATH: &str = "/api/v1/sessions/opaque/start";
pub const LOGIN_FINISH_PATH: &str = "/api/v1/sessions/opaque/finish";
pub const RECOVERY_START_PATH: &str = "/api/v1/recoveries/opaque/start";
pub const RECOVERY_FINISH_PATH: &str = "/api/v1/recoveries/opaque/finish";
pub const CURRENT_SESSION_PATH: &str = "/api/v1/sessions/current";
pub const CURRENT_ACCOUNT_PATH: &str = "/api/v1/accounts/current";
pub const COUPLE_INVITES_PATH: &str = "/api/v1/couple-invites";
pub const COUPLE_INVITE_REDEEM_PATH: &str = "/api/v1/couple-invites/redeem";
pub const BILLING_CHECKOUT_PATH: &str = "/api/v1/billing/checkout";
pub const BILLING_ENTITLEMENT_PATH: &str = "/api/v1/billing/entitlement";
pub const STRIPE_WEBHOOK_PATH: &str = "/api/v1/billing/stripe-webhook";
pub const HEALTH_DATA_CONSENT_VERSION: &str = "2026-07-19";
pub const MAX_AUTH_MESSAGE_BYTES: usize = 4096;
pub const MAX_PUSH_OPERATIONS: usize = 100;
pub const MAX_ENVELOPE_BYTES: usize = 256 * 1024;
pub const MAX_PAGE_BYTES: usize = 1024 * 1024;
pub const MAX_REDACTION_OPERATIONS: usize = 100;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApiErrorCode {
    InvalidRequest,
    InvalidCredentials,
    AuthenticationRequired,
    Forbidden,
    Conflict,
    RateLimited,
    StaleEpoch,
    RotationPending,
    PayloadTooLarge,
    ServiceUnavailable,
    Internal,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApiErrorBody {
    pub error: ApiErrorCode,
    pub request_id: Uuid,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OpaqueMessage {
    pub message: String,
}

impl OpaqueMessage {
    pub fn from_bytes(bytes: &[u8]) -> Self {
        Self {
            message: URL_SAFE_NO_PAD.encode(bytes),
        }
    }

    pub fn decode(&self) -> Result<Vec<u8>, WireError> {
        let bytes = URL_SAFE_NO_PAD
            .decode(&self.message)
            .map_err(|_| WireError::InvalidBase64)?;
        if bytes.is_empty() || bytes.len() > MAX_AUTH_MESSAGE_BYTES {
            return Err(WireError::InvalidAuthMessageSize);
        }
        Ok(bytes)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RegistrationStartRequest {
    pub account_identifier: String,
    pub registration_request: OpaqueMessage,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RegistrationStartResponse {
    pub flow_id: Uuid,
    pub registration_response: OpaqueMessage,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RegistrationFinishRequest {
    pub flow_id: Uuid,
    pub device_id: Uuid,
    pub dataset_id: Uuid,
    pub registration_upload: OpaqueMessage,
    pub device_public_key: OpaqueMessage,
    pub device_signature: OpaqueMessage,
    pub wrapped_account_key: OpaqueMessage,
    pub recovery_wrapped_account_key: OpaqueMessage,
    pub recovery_public_key: OpaqueMessage,
    pub wrapped_dataset_key: OpaqueMessage,
    pub health_data_consent: HealthDataConsent,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HealthDataConsent {
    pub policy_version: String,
    pub affirmative: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RegistrationFinishResponse {
    pub account_id: Uuid,
    pub device_id: Uuid,
    pub dataset_id: Uuid,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LoginStartRequest {
    pub account_identifier: String,
    pub device_id: Uuid,
    pub credential_request: OpaqueMessage,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LoginStartResponse {
    pub flow_id: Uuid,
    pub credential_response: OpaqueMessage,
    pub device_challenge: OpaqueMessage,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LoginFinishRequest {
    pub flow_id: Uuid,
    pub credential_finalization: OpaqueMessage,
    pub device_id: Uuid,
    pub device_signature: OpaqueMessage,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LoginFinishResponse {
    pub access_token: OpaqueMessage,
    pub account_id: Uuid,
    pub device_id: Uuid,
    pub expires_at_unix_seconds: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AccountDeletionResponse {
    pub deletion_id: Uuid,
    pub deleted_at_unix_seconds: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BillingInterval {
    Monthly,
    Annual,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CheckoutSessionRequest {
    pub interval: BillingInterval,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CheckoutSessionResponse {
    pub checkout_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EntitlementResponse {
    pub status: String,
    pub sync_allowed: bool,
    pub current_period_ends_at_unix_seconds: Option<i64>,
    pub grace_ends_at_unix_seconds: Option<i64>,
    pub scheduled_deletion_at_unix_seconds: Option<i64>,
}

/// Registers a short-lived, single-use invitation. The verifier is derived
/// from the client-only invite secret; the secret and dataset key are never
/// sent to the service.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CoupleInviteCreateRequest {
    pub invite_id: Uuid,
    pub dataset_id: Uuid,
    pub verifier: OpaqueMessage,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CoupleInviteCreateResponse {
    pub invite_id: Uuid,
    pub dataset_id: Uuid,
    pub expires_at_unix_seconds: i64,
}

/// Redeems an invitation using proof of possession of its client-only secret.
/// `wrapped_dataset_key` is ciphertext addressed to the accepting account.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CoupleInviteRedeemRequest {
    pub invite_id: Uuid,
    pub verifier: OpaqueMessage,
    pub wrapped_dataset_key: OpaqueMessage,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CoupleInviteRedeemResponse {
    pub invite_id: Uuid,
    pub dataset_id: Uuid,
    pub key_epoch: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecoveryStartRequest {
    pub account_identifier: String,
    pub registration_request: OpaqueMessage,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecoveryStartResponse {
    pub flow_id: Uuid,
    pub registration_response: OpaqueMessage,
    pub recovery_challenge: OpaqueMessage,
    pub dataset_id: Uuid,
    pub recovery_wrapped_account_key: OpaqueMessage,
    pub wrapped_dataset_key: OpaqueMessage,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecoveryFinishRequest {
    pub flow_id: Uuid,
    pub device_id: Uuid,
    pub dataset_id: Uuid,
    pub registration_upload: OpaqueMessage,
    pub device_public_key: OpaqueMessage,
    pub device_signature: OpaqueMessage,
    pub recovery_signature: OpaqueMessage,
    pub wrapped_account_key: OpaqueMessage,
    pub recovery_wrapped_account_key: OpaqueMessage,
    pub wrapped_dataset_key: OpaqueMessage,
}

pub type RecoveryFinishResponse = RegistrationFinishResponse;

pub fn registration_device_proof_message(
    flow_id: Uuid,
    device_id: Uuid,
    dataset_id: Uuid,
    registration_upload: &[u8],
) -> Vec<u8> {
    const DOMAIN: &[u8] = b"verelle/device-registration/v1";
    let upload_hash = Sha256::digest(registration_upload);
    let mut message = Vec::with_capacity(DOMAIN.len() + 16 * 3 + upload_hash.len());
    message.extend_from_slice(DOMAIN);
    message.extend_from_slice(flow_id.as_bytes());
    message.extend_from_slice(device_id.as_bytes());
    message.extend_from_slice(dataset_id.as_bytes());
    message.extend_from_slice(&upload_hash);
    message
}

pub fn login_device_proof_message(flow_id: Uuid, challenge: &[u8]) -> Vec<u8> {
    const DOMAIN: &[u8] = b"verelle/device-login/v1";
    let mut message = Vec::with_capacity(DOMAIN.len() + 16 + challenge.len());
    message.extend_from_slice(DOMAIN);
    message.extend_from_slice(flow_id.as_bytes());
    message.extend_from_slice(challenge);
    message
}

pub fn recovery_account_proof_message(
    request: &RecoveryFinishRequest,
    challenge: &[u8],
) -> Vec<u8> {
    const DOMAIN: &[u8] = b"verelle/account-recovery/v1";
    let fields = [
        request.registration_upload.message.as_bytes(),
        request.device_public_key.message.as_bytes(),
        request.wrapped_account_key.message.as_bytes(),
        request.recovery_wrapped_account_key.message.as_bytes(),
        request.wrapped_dataset_key.message.as_bytes(),
    ];
    let mut message = Vec::with_capacity(DOMAIN.len() + 16 * 3 + challenge.len() + 160);
    message.extend_from_slice(DOMAIN);
    message.extend_from_slice(request.flow_id.as_bytes());
    message.extend_from_slice(request.device_id.as_bytes());
    message.extend_from_slice(request.dataset_id.as_bytes());
    message.extend_from_slice(challenge);
    for field in fields {
        message.extend_from_slice(&Sha256::digest(field));
    }
    message
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TransportOperation {
    pub operation_id: Uuid,
    pub key_epoch: u64,
    pub envelope: String,
}

impl TransportOperation {
    pub fn from_transport(operation: &TransportOp) -> Self {
        Self {
            operation_id: operation.op_id,
            key_epoch: operation.key_epoch,
            envelope: URL_SAFE_NO_PAD.encode(&operation.envelope),
        }
    }

    pub fn into_transport(self) -> Result<TransportOp, WireError> {
        let envelope = URL_SAFE_NO_PAD
            .decode(&self.envelope)
            .map_err(|_| WireError::InvalidBase64)?;
        if envelope.is_empty() || envelope.len() > MAX_ENVELOPE_BYTES {
            return Err(WireError::InvalidEnvelopeSize);
        }
        if self.key_epoch == 0 {
            return Err(WireError::InvalidEpoch);
        }
        Ok(TransportOp {
            op_id: self.operation_id,
            key_epoch: self.key_epoch,
            envelope,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PushRequest {
    pub operations: Vec<TransportOperation>,
}

impl PushRequest {
    pub fn decode(self) -> Result<Vec<TransportOp>, WireError> {
        if self.operations.is_empty() || self.operations.len() > MAX_PUSH_OPERATIONS {
            return Err(WireError::InvalidOperationCount);
        }
        let operations = self
            .operations
            .into_iter()
            .map(TransportOperation::into_transport)
            .collect::<Result<Vec<_>, _>>()?;
        let total_bytes = operations.iter().try_fold(0_usize, |total, operation| {
            total.checked_add(operation.envelope.len())
        });
        if total_bytes.is_none_or(|total| total > MAX_PAGE_BYTES) {
            return Err(WireError::PayloadTooLarge);
        }
        Ok(operations)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AcceptedOperation {
    pub operation_id: Uuid,
    pub server_sequence: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PushResponse {
    pub accepted: Vec<AcceptedOperation>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RedactOperationsRequest {
    pub operation_ids: Vec<Uuid>,
}

impl RedactOperationsRequest {
    pub fn validate(&self) -> Result<(), WireError> {
        if self.operation_ids.is_empty()
            || self.operation_ids.len() > MAX_REDACTION_OPERATIONS
            || self.operation_ids.iter().any(Uuid::is_nil)
        {
            return Err(WireError::InvalidOperationCount);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RedactOperationsResponse {
    pub redacted: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SequencedOperation {
    pub server_sequence: u64,
    pub operation: TransportOperation,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PullResponse {
    pub after_cursor: u64,
    pub next_cursor: u64,
    pub operations: Vec<SequencedOperation>,
    pub more: bool,
}

impl From<&TransportPage> for PullResponse {
    fn from(page: &TransportPage) -> Self {
        Self {
            after_cursor: page.after_cursor,
            next_cursor: page.next_cursor,
            operations: page
                .operations
                .iter()
                .map(|sequenced| SequencedOperation {
                    server_sequence: sequenced.server_seq,
                    operation: TransportOperation::from_transport(&sequenced.operation),
                })
                .collect(),
            more: page.more,
        }
    }
}

impl PullResponse {
    pub fn into_transport_page(self) -> Result<TransportPage, WireError> {
        let operations = self
            .operations
            .into_iter()
            .map(|sequenced| {
                Ok(SequencedTransportOp {
                    server_seq: sequenced.server_sequence,
                    operation: sequenced.operation.into_transport()?,
                })
            })
            .collect::<Result<_, WireError>>()?;
        Ok(TransportPage {
            after_cursor: self.after_cursor,
            next_cursor: self.next_cursor,
            operations,
            more: self.more,
        })
    }
}

pub fn dataset_operations_path(dataset_id: Uuid) -> String {
    format!("{API_PREFIX}/datasets/{dataset_id}/operations")
}

pub fn dataset_operation_redactions_path(dataset_id: Uuid) -> String {
    format!("{API_PREFIX}/datasets/{dataset_id}/operation-redactions")
}

#[derive(Debug, Error, Clone, Copy, PartialEq, Eq)]
pub enum WireError {
    #[error("wire value is not valid base64url")]
    InvalidBase64,
    #[error("OPAQUE message is empty or exceeds the limit")]
    InvalidAuthMessageSize,
    #[error("operation batch is empty or exceeds the limit")]
    InvalidOperationCount,
    #[error("encrypted envelope is empty or exceeds the limit")]
    InvalidEnvelopeSize,
    #[error("operation payload exceeds the page limit")]
    PayloadTooLarge,
    #[error("key epoch must be greater than zero")]
    InvalidEpoch,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypted_transport_round_trips_without_json_byte_arrays() {
        let transport = TransportOp {
            op_id: Uuid::new_v4(),
            key_epoch: 3,
            envelope: vec![1, 2, 3, 254, 255],
        };
        let wire = TransportOperation::from_transport(&transport);
        let json = serde_json::to_string(&wire).unwrap();
        assert!(!json.contains("[1,2,3"));
        assert_eq!(wire.into_transport().unwrap(), transport);
    }

    #[test]
    fn request_limits_fail_closed() {
        assert_eq!(
            PushRequest {
                operations: Vec::new()
            }
            .decode(),
            Err(WireError::InvalidOperationCount)
        );
        assert_eq!(
            OpaqueMessage {
                message: String::new()
            }
            .decode(),
            Err(WireError::InvalidAuthMessageSize)
        );
    }

    #[test]
    fn contract_has_no_plaintext_health_fields() {
        let operation = TransportOperation {
            operation_id: Uuid::nil(),
            key_epoch: 1,
            envelope: "AQID".to_owned(),
        };
        let json = serde_json::to_string(&operation).unwrap();
        for forbidden in [
            "observation",
            "record_key",
            "cycle_start",
            "monitor_reading",
        ] {
            assert!(!json.contains(forbidden));
        }
    }

    #[test]
    fn device_proof_messages_bind_every_protocol_identifier() {
        let flow = Uuid::new_v4();
        let device = Uuid::new_v4();
        let dataset = Uuid::new_v4();
        let registration = registration_device_proof_message(flow, device, dataset, b"upload");
        assert_ne!(
            registration,
            registration_device_proof_message(flow, device, Uuid::new_v4(), b"upload")
        );
        assert_ne!(
            registration,
            registration_device_proof_message(flow, device, dataset, b"different")
        );
        assert_ne!(
            login_device_proof_message(flow, b"challenge"),
            login_device_proof_message(flow, b"different")
        );
    }
}

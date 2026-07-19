//! PostgreSQL-backed OPAQUE account and opaque-session service.

use crate::{
    database::Database,
    http_api::{AuthorizedPrincipal, DatasetAuthorizer},
};
use axum::{
    Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, StatusCode, header::AUTHORIZATION},
    response::{IntoResponse, Response},
    routing::{delete, post},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use p256::{
    ecdsa::{Signature, VerifyingKey, signature::Verifier},
    pkcs8::DecodePublicKey,
};
use rand::{RngCore, rngs::OsRng};
use sha2::{Digest, Sha256};
use sqlx_core::{error::Error as SqlxError, query::query, row::Row};
use sqlx_postgres::Postgres;
use std::sync::Arc;
use thiserror::Error;
use uuid::Uuid;
use verelle_api::{
    AccountDeletionResponse, ApiErrorBody, ApiErrorCode, HEALTH_DATA_CONSENT_VERSION,
    LoginFinishRequest, LoginFinishResponse, LoginStartRequest, LoginStartResponse, OpaqueMessage,
    RegistrationFinishRequest, RegistrationFinishResponse, RegistrationStartRequest,
    RegistrationStartResponse, login_device_proof_message, registration_device_proof_message,
};
use verelle_auth::{
    account_credential_identifier, server_login_finish, server_login_start,
    server_registration_finish, server_registration_start, server_static_public_key,
};
use zeroize::{Zeroize, Zeroizing};

const AUTH_BODY_LIMIT_BYTES: usize = 32 * 1024;
const MAX_AUTH_STARTS_PER_IDENTIFIER: i64 = 10;
const SESSION_TOKEN_BYTES: usize = 32;
const MAX_DEVICE_PUBLIC_KEY_BYTES: usize = 1024;
const MAX_WRAPPED_KEY_BYTES: usize = 4096;
const DEVICE_CHALLENGE_BYTES: usize = 32;

#[derive(Debug, Clone)]
pub struct AuthService {
    database: Database,
    server_setup: Arc<Zeroizing<Vec<u8>>>,
}

impl AuthService {
    pub fn new(database: Database, server_setup: Vec<u8>) -> Result<Self, AuthServiceError> {
        server_static_public_key(&server_setup).map_err(|_| AuthServiceError::InvalidSetup)?;
        Ok(Self {
            database,
            server_setup: Arc::new(Zeroizing::new(server_setup)),
        })
    }

    pub async fn registration_start(
        &self,
        request: RegistrationStartRequest,
    ) -> Result<RegistrationStartResponse, AuthServiceError> {
        let identifier = account_credential_identifier(&request.account_identifier)
            .map_err(|_| AuthServiceError::InvalidRequest)?;
        self.enforce_start_rate_limit(&identifier).await?;
        let registration_request = request
            .registration_request
            .decode()
            .map_err(|_| AuthServiceError::InvalidRequest)?;
        let response = server_registration_start(
            self.server_setup.as_slice(),
            &identifier,
            &registration_request,
        )
        .map_err(|_| AuthServiceError::InvalidRequest)?;
        let flow_id = Uuid::new_v4();
        query::<Postgres>(
            "INSERT INTO opaque_auth_flows \
             (flow_id, flow_kind, identifier_hash, expires_at) \
             VALUES ($1, 'registration', $2, CURRENT_TIMESTAMP + INTERVAL '10 minutes')",
        )
        .bind(flow_id)
        .bind(identifier.as_slice())
        .execute(self.database.pool())
        .await?;
        Ok(RegistrationStartResponse {
            flow_id,
            registration_response: OpaqueMessage::from_bytes(&response),
        })
    }

    #[allow(clippy::too_many_lines)] // Keep the audited enrollment transaction linear and atomic.
    pub async fn registration_finish(
        &self,
        request: RegistrationFinishRequest,
    ) -> Result<RegistrationFinishResponse, AuthServiceError> {
        if request.device_id.is_nil()
            || request.dataset_id.is_nil()
            || !request.health_data_consent.affirmative
            || request.health_data_consent.policy_version != HEALTH_DATA_CONSENT_VERSION
        {
            return Err(AuthServiceError::InvalidRequest);
        }
        let registration_upload = request
            .registration_upload
            .decode()
            .map_err(|_| AuthServiceError::InvalidRequest)?;
        let password_file = server_registration_finish(&registration_upload)
            .map_err(|_| AuthServiceError::InvalidRequest)?;
        let device_public_key =
            decode_bounded(&request.device_public_key, MAX_DEVICE_PUBLIC_KEY_BYTES)?;
        let device_signature =
            decode_bounded(&request.device_signature, MAX_DEVICE_PUBLIC_KEY_BYTES)?;
        let device_proof = registration_device_proof_message(
            request.flow_id,
            request.device_id,
            request.dataset_id,
            &registration_upload,
        );
        if !verify_device_signature(&device_public_key, &device_signature, &device_proof) {
            return Err(AuthServiceError::InvalidRequest);
        }
        let wrapped_account_key =
            decode_bounded(&request.wrapped_account_key, MAX_WRAPPED_KEY_BYTES)?;
        let recovery_wrapped_account_key =
            decode_bounded(&request.recovery_wrapped_account_key, MAX_WRAPPED_KEY_BYTES)?;
        let wrapped_dataset_key =
            decode_bounded(&request.wrapped_dataset_key, MAX_WRAPPED_KEY_BYTES)?;

        let mut transaction = self.database.pool().begin().await?;
        let flow = query::<Postgres>(
            "SELECT identifier_hash FROM opaque_auth_flows \
             WHERE flow_id = $1 AND flow_kind = 'registration' \
               AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP \
             FOR UPDATE",
        )
        .bind(request.flow_id)
        .fetch_optional(&mut *transaction)
        .await?
        .ok_or(AuthServiceError::InvalidCredentials)?;
        let identifier_hash = flow.get::<Vec<u8>, _>("identifier_hash");
        let account_id = Uuid::new_v4();
        let device_id = request.device_id;
        let dataset_id = request.dataset_id;
        query::<Postgres>(
            "INSERT INTO accounts \
             (account_id, identifier_hash, opaque_password_file, wrapped_account_key, recovery_wrapped_account_key) \
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(account_id)
        .bind(identifier_hash)
        .bind(password_file)
        .bind(wrapped_account_key)
        .bind(recovery_wrapped_account_key)
        .execute(&mut *transaction)
        .await
        .map_err(map_account_insert_error)?;
        query::<Postgres>(
            "INSERT INTO account_devices (device_id, account_id, public_key, key_algorithm) \
             VALUES ($1, $2, $3, 'p256_ecdsa_sha256_spki')",
        )
        .bind(device_id)
        .bind(account_id)
        .bind(device_public_key)
        .execute(&mut *transaction)
        .await?;
        query::<Postgres>("INSERT INTO sync_datasets (dataset_id, current_epoch) VALUES ($1, 1)")
            .bind(dataset_id)
            .execute(&mut *transaction)
            .await?;
        query::<Postgres>(
            "INSERT INTO dataset_memberships (dataset_id, account_id, role) \
             VALUES ($1, $2, 'owner')",
        )
        .bind(dataset_id)
        .bind(account_id)
        .execute(&mut *transaction)
        .await?;
        query::<Postgres>(
            "INSERT INTO dataset_key_wraps (dataset_id, account_id, key_epoch, wrapped_key) \
             VALUES ($1, $2, 1, $3)",
        )
        .bind(dataset_id)
        .bind(account_id)
        .bind(wrapped_dataset_key)
        .execute(&mut *transaction)
        .await?;
        query::<Postgres>(
            "INSERT INTO account_consents (account_id, consent_kind, policy_version) \
             VALUES ($1, 'consumer_health_data_collection', $2)",
        )
        .bind(account_id)
        .bind(&request.health_data_consent.policy_version)
        .execute(&mut *transaction)
        .await?;
        consume_flow(&mut transaction, request.flow_id).await?;
        transaction.commit().await?;
        Ok(RegistrationFinishResponse {
            account_id,
            device_id,
            dataset_id,
        })
    }

    pub async fn login_start(
        &self,
        request: LoginStartRequest,
    ) -> Result<LoginStartResponse, AuthServiceError> {
        let identifier = account_credential_identifier(&request.account_identifier)
            .map_err(|_| AuthServiceError::InvalidRequest)?;
        self.enforce_start_rate_limit(&identifier).await?;
        let account = query::<Postgres>(
            "SELECT account.account_id, account.opaque_password_file FROM accounts account \
             JOIN account_devices device ON device.account_id = account.account_id \
             WHERE account.identifier_hash = $1 AND account.disabled_at IS NULL \
               AND device.device_id = $2 AND device.revoked_at IS NULL",
        )
        .bind(identifier.as_slice())
        .bind(request.device_id)
        .fetch_optional(self.database.pool())
        .await?;
        let account_id = account.as_ref().map(|row| row.get::<Uuid, _>("account_id"));
        let password_file = account
            .as_ref()
            .map(|row| row.get::<Vec<u8>, _>("opaque_password_file"));
        let credential_request = request
            .credential_request
            .decode()
            .map_err(|_| AuthServiceError::InvalidRequest)?;
        let started = server_login_start(
            self.server_setup.as_slice(),
            password_file.as_deref(),
            &identifier,
            &credential_request,
        )
        .map_err(|_| AuthServiceError::InvalidRequest)?;
        let flow_id = Uuid::new_v4();
        let mut device_challenge = [0_u8; DEVICE_CHALLENGE_BYTES];
        OsRng.fill_bytes(&mut device_challenge);
        query::<Postgres>(
            "INSERT INTO opaque_auth_flows \
             (flow_id, flow_kind, identifier_hash, account_id, opaque_server_state, \
              device_id, device_challenge, expires_at) \
             VALUES ($1, 'login', $2, $3, $4, $5, $6, \
                     CURRENT_TIMESTAMP + INTERVAL '5 minutes')",
        )
        .bind(flow_id)
        .bind(identifier.as_slice())
        .bind(account_id)
        .bind(started.state)
        .bind(request.device_id)
        .bind(device_challenge.as_slice())
        .execute(self.database.pool())
        .await?;
        Ok(LoginStartResponse {
            flow_id,
            credential_response: OpaqueMessage::from_bytes(&started.response),
            device_challenge: OpaqueMessage::from_bytes(&device_challenge),
        })
    }

    pub async fn login_finish(
        &self,
        request: LoginFinishRequest,
    ) -> Result<LoginFinishResponse, AuthServiceError> {
        let finalization = request
            .credential_finalization
            .decode()
            .map_err(|_| AuthServiceError::InvalidCredentials)?;
        let device_signature = request
            .device_signature
            .decode()
            .map_err(|_| AuthServiceError::InvalidCredentials)?;
        let mut transaction = self.database.pool().begin().await?;
        let flow = query::<Postgres>(
            "SELECT identifier_hash, account_id, opaque_server_state, \
                    device_id, device_challenge \
             FROM opaque_auth_flows \
             WHERE flow_id = $1 AND flow_kind = 'login' \
               AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP \
             FOR UPDATE",
        )
        .bind(request.flow_id)
        .fetch_optional(&mut *transaction)
        .await?
        .ok_or(AuthServiceError::InvalidCredentials)?;
        let identifier_hash = flow.get::<Vec<u8>, _>("identifier_hash");
        let account_id = flow.get::<Option<Uuid>, _>("account_id");
        let flow_device_id = flow.get::<Option<Uuid>, _>("device_id");
        let device_challenge = flow.get::<Option<Vec<u8>>, _>("device_challenge");
        let mut server_state = flow.get::<Vec<u8>, _>("opaque_server_state");
        let finish_result = server_login_finish(&server_state, &identifier_hash, &finalization);
        server_state.zeroize();
        let Ok(mut session_key) = finish_result else {
            consume_flow(&mut transaction, request.flow_id).await?;
            transaction.commit().await?;
            return Err(AuthServiceError::InvalidCredentials);
        };
        session_key.zeroize();
        let Some(account_id) = account_id else {
            consume_flow(&mut transaction, request.flow_id).await?;
            transaction.commit().await?;
            return Err(AuthServiceError::InvalidCredentials);
        };
        let Some(device_challenge) = device_challenge.filter(|value| value.len() == 32) else {
            consume_flow(&mut transaction, request.flow_id).await?;
            transaction.commit().await?;
            return Err(AuthServiceError::InvalidCredentials);
        };
        if flow_device_id != Some(request.device_id) {
            consume_flow(&mut transaction, request.flow_id).await?;
            transaction.commit().await?;
            return Err(AuthServiceError::InvalidCredentials);
        }
        let device = query::<Postgres>(
            "SELECT public_key FROM account_devices \
             WHERE device_id = $1 AND account_id = $2 AND revoked_at IS NULL",
        )
        .bind(request.device_id)
        .bind(account_id)
        .fetch_optional(&mut *transaction)
        .await?;
        let Some(device) = device else {
            consume_flow(&mut transaction, request.flow_id).await?;
            transaction.commit().await?;
            return Err(AuthServiceError::InvalidCredentials);
        };
        let device_public_key = device.get::<Vec<u8>, _>("public_key");
        let device_proof = login_device_proof_message(request.flow_id, &device_challenge);
        if !verify_device_signature(&device_public_key, &device_signature, &device_proof) {
            consume_flow(&mut transaction, request.flow_id).await?;
            transaction.commit().await?;
            return Err(AuthServiceError::InvalidCredentials);
        }

        let mut access_token = [0_u8; SESSION_TOKEN_BYTES];
        OsRng.fill_bytes(&mut access_token);
        let token_hash = Sha256::digest(access_token);
        let session_id = Uuid::new_v4();
        let session = query::<Postgres>(
            "INSERT INTO account_sessions \
             (session_id, account_id, device_id, token_hash, expires_at) \
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + INTERVAL '30 days') \
             RETURNING EXTRACT(EPOCH FROM expires_at)::BIGINT AS expires_at_unix_seconds",
        )
        .bind(session_id)
        .bind(account_id)
        .bind(request.device_id)
        .bind(token_hash.as_slice())
        .fetch_one(&mut *transaction)
        .await?;
        consume_flow(&mut transaction, request.flow_id).await?;
        transaction.commit().await?;
        let response = LoginFinishResponse {
            access_token: OpaqueMessage::from_bytes(&access_token),
            account_id,
            device_id: request.device_id,
            expires_at_unix_seconds: session.get("expires_at_unix_seconds"),
        };
        access_token.zeroize();
        Ok(response)
    }

    pub async fn revoke_session(&self, bearer_token: &str) -> Result<(), AuthServiceError> {
        let token_hash = decode_and_hash_token(bearer_token)?;
        query::<Postgres>(
            "UPDATE account_sessions SET revoked_at = CURRENT_TIMESTAMP \
             WHERE token_hash = $1 AND revoked_at IS NULL",
        )
        .bind(token_hash.as_slice())
        .execute(self.database.pool())
        .await?;
        Ok(())
    }

    pub async fn delete_account(
        &self,
        bearer_token: &str,
    ) -> Result<AccountDeletionResponse, AuthServiceError> {
        let token_hash = decode_and_hash_token(bearer_token)?;
        let mut transaction = self.database.pool().begin().await?;
        let session = query::<Postgres>(
            "SELECT session.account_id FROM account_sessions session \
             JOIN accounts account ON account.account_id = session.account_id \
             WHERE session.token_hash = $1 AND session.revoked_at IS NULL \
               AND session.expires_at > CURRENT_TIMESTAMP AND account.disabled_at IS NULL \
             FOR UPDATE OF session, account",
        )
        .bind(token_hash.as_slice())
        .fetch_optional(&mut *transaction)
        .await?
        .ok_or(AuthServiceError::AuthenticationRequired)?;
        let account_id = session.get::<Uuid, _>("account_id");
        let datasets = query::<Postgres>(
            "SELECT dataset_id FROM dataset_memberships \
             WHERE account_id = $1 AND removed_at IS NULL FOR UPDATE",
        )
        .bind(account_id)
        .fetch_all(&mut *transaction)
        .await?
        .into_iter()
        .map(|row| row.get::<Uuid, _>("dataset_id"))
        .collect::<Vec<_>>();
        for dataset_id in &datasets {
            let active_members = query::<Postgres>(
                "SELECT COUNT(*)::BIGINT AS count FROM dataset_memberships \
                 WHERE dataset_id = $1 AND removed_at IS NULL",
            )
            .bind(dataset_id)
            .fetch_one(&mut *transaction)
            .await?
            .get::<i64, _>("count");
            if active_members != 1 {
                return Err(AuthServiceError::Conflict);
            }
        }

        let deletion_id = Uuid::new_v4();
        let deletion = query::<Postgres>(
            "INSERT INTO deletion_manifests \
             (deletion_id, requested_account_id, completed_at) \
             VALUES ($1, $2, CURRENT_TIMESTAMP) \
             RETURNING EXTRACT(EPOCH FROM completed_at)::BIGINT AS deleted_at_unix_seconds",
        )
        .bind(deletion_id)
        .bind(account_id)
        .fetch_one(&mut *transaction)
        .await?;
        for dataset_id in &datasets {
            query::<Postgres>(
                "INSERT INTO deletion_manifest_datasets (deletion_id, dataset_id) \
                 VALUES ($1, $2)",
            )
            .bind(deletion_id)
            .bind(dataset_id)
            .execute(&mut *transaction)
            .await?;
            query::<Postgres>("DELETE FROM sync_datasets WHERE dataset_id = $1")
                .bind(dataset_id)
                .execute(&mut *transaction)
                .await?;
        }
        query::<Postgres>("DELETE FROM accounts WHERE account_id = $1")
            .bind(account_id)
            .execute(&mut *transaction)
            .await?;
        transaction.commit().await?;
        Ok(AccountDeletionResponse {
            deletion_id,
            deleted_at_unix_seconds: deletion.get("deleted_at_unix_seconds"),
        })
    }

    async fn enforce_start_rate_limit(
        &self,
        identifier_hash: &[u8; 32],
    ) -> Result<(), AuthServiceError> {
        let advisory_key = i64::from_be_bytes(
            identifier_hash[..8]
                .try_into()
                .expect("a 32-byte identifier hash always has an 8-byte prefix"),
        );
        let mut transaction = self.database.pool().begin().await?;
        query::<Postgres>("SELECT pg_advisory_xact_lock($1)")
            .bind(advisory_key)
            .execute(&mut *transaction)
            .await?;
        query::<Postgres>(
            "DELETE FROM auth_start_attempts \
             WHERE identifier_hash = $1 \
               AND attempted_at <= CURRENT_TIMESTAMP - INTERVAL '24 hours'",
        )
        .bind(identifier_hash.as_slice())
        .execute(&mut *transaction)
        .await?;
        let count = query::<Postgres>(
            "SELECT COUNT(*)::BIGINT AS count FROM auth_start_attempts \
             WHERE identifier_hash = $1 \
               AND attempted_at > CURRENT_TIMESTAMP - INTERVAL '15 minutes'",
        )
        .bind(identifier_hash.as_slice())
        .fetch_one(&mut *transaction)
        .await?
        .get::<i64, _>("count");
        if count >= MAX_AUTH_STARTS_PER_IDENTIFIER {
            return Err(AuthServiceError::RateLimited);
        }
        query::<Postgres>("INSERT INTO auth_start_attempts (identifier_hash) VALUES ($1)")
            .bind(identifier_hash.as_slice())
            .execute(&mut *transaction)
            .await?;
        transaction.commit().await?;
        Ok(())
    }
}

impl DatasetAuthorizer for AuthService {
    async fn authorize(
        &self,
        bearer_token: String,
        dataset_id: Uuid,
    ) -> Option<AuthorizedPrincipal> {
        let token_hash = decode_and_hash_token(&bearer_token).ok()?;
        let row = query::<Postgres>(
            "SELECT session.account_id, session.device_id \
             FROM account_sessions session \
             JOIN accounts account ON account.account_id = session.account_id \
             JOIN account_devices device \
               ON device.device_id = session.device_id AND device.account_id = session.account_id \
             JOIN dataset_memberships membership \
               ON membership.account_id = session.account_id AND membership.dataset_id = $2 \
             WHERE session.token_hash = $1 \
               AND session.revoked_at IS NULL AND session.expires_at > CURRENT_TIMESTAMP \
               AND account.disabled_at IS NULL AND device.revoked_at IS NULL \
               AND membership.removed_at IS NULL",
        )
        .bind(token_hash.as_slice())
        .bind(dataset_id)
        .fetch_optional(self.database.pool())
        .await
        .ok()??;
        Some(AuthorizedPrincipal {
            account_id: row.get("account_id"),
            device_id: row.get("device_id"),
        })
    }
}

pub fn account_router(auth_service: AuthService) -> Router {
    Router::new()
        .route(
            verelle_api::REGISTRATION_START_PATH,
            post(registration_start),
        )
        .route(
            verelle_api::REGISTRATION_FINISH_PATH,
            post(registration_finish),
        )
        .route(verelle_api::LOGIN_START_PATH, post(login_start))
        .route(verelle_api::LOGIN_FINISH_PATH, post(login_finish))
        .route(verelle_api::CURRENT_SESSION_PATH, delete(logout))
        .route(verelle_api::CURRENT_ACCOUNT_PATH, delete(delete_account))
        .layer(DefaultBodyLimit::max(AUTH_BODY_LIMIT_BYTES))
        .with_state(auth_service)
}

async fn registration_start(
    State(service): State<AuthService>,
    Json(request): Json<RegistrationStartRequest>,
) -> Result<Json<RegistrationStartResponse>, AuthServiceError> {
    Ok(Json(service.registration_start(request).await?))
}

async fn registration_finish(
    State(service): State<AuthService>,
    Json(request): Json<RegistrationFinishRequest>,
) -> Result<Json<RegistrationFinishResponse>, AuthServiceError> {
    Ok(Json(service.registration_finish(request).await?))
}

async fn login_start(
    State(service): State<AuthService>,
    Json(request): Json<LoginStartRequest>,
) -> Result<Json<LoginStartResponse>, AuthServiceError> {
    Ok(Json(service.login_start(request).await?))
}

async fn login_finish(
    State(service): State<AuthService>,
    Json(request): Json<LoginFinishRequest>,
) -> Result<Json<LoginFinishResponse>, AuthServiceError> {
    Ok(Json(service.login_finish(request).await?))
}

async fn logout(
    State(service): State<AuthService>,
    headers: HeaderMap,
) -> Result<StatusCode, AuthServiceError> {
    let token = bearer_token(&headers)?;
    service.revoke_session(token).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn delete_account(
    State(service): State<AuthService>,
    headers: HeaderMap,
) -> Result<Json<AccountDeletionResponse>, AuthServiceError> {
    let token = bearer_token(&headers)?;
    Ok(Json(service.delete_account(token).await?))
}

fn bearer_token(headers: &HeaderMap) -> Result<&str, AuthServiceError> {
    headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|value| !value.is_empty() && value.len() <= 512)
        .ok_or(AuthServiceError::AuthenticationRequired)
}

fn decode_bounded(message: &OpaqueMessage, max: usize) -> Result<Vec<u8>, AuthServiceError> {
    let decoded = message
        .decode()
        .map_err(|_| AuthServiceError::InvalidRequest)?;
    if decoded.len() > max {
        return Err(AuthServiceError::InvalidRequest);
    }
    Ok(decoded)
}

fn verify_device_signature(public_key: &[u8], signature: &[u8], message: &[u8]) -> bool {
    let Ok(verifying_key) = VerifyingKey::from_public_key_der(public_key) else {
        return false;
    };
    let signature = Signature::from_slice(signature).or_else(|_| Signature::from_der(signature));
    signature.is_ok_and(|signature| verifying_key.verify(message, &signature).is_ok())
}

fn decode_and_hash_token(token: &str) -> Result<[u8; 32], AuthServiceError> {
    let mut bytes = URL_SAFE_NO_PAD
        .decode(token)
        .map_err(|_| AuthServiceError::AuthenticationRequired)?;
    if bytes.len() != SESSION_TOKEN_BYTES {
        bytes.zeroize();
        return Err(AuthServiceError::AuthenticationRequired);
    }
    let hash = Sha256::digest(&bytes).into();
    bytes.zeroize();
    Ok(hash)
}

async fn consume_flow(
    transaction: &mut sqlx_core::transaction::Transaction<'_, Postgres>,
    flow_id: Uuid,
) -> Result<(), SqlxError> {
    query::<Postgres>(
        "UPDATE opaque_auth_flows SET consumed_at = CURRENT_TIMESTAMP WHERE flow_id = $1",
    )
    .bind(flow_id)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

fn map_account_insert_error(error: SqlxError) -> AuthServiceError {
    if error
        .as_database_error()
        .and_then(sqlx_core::error::DatabaseError::code)
        .as_deref()
        == Some("23505")
    {
        AuthServiceError::Conflict
    } else {
        AuthServiceError::Database(error)
    }
}

#[derive(Debug, Error)]
pub enum AuthServiceError {
    #[error("OPAQUE server setup is invalid")]
    InvalidSetup,
    #[error("request is invalid")]
    InvalidRequest,
    #[error("credentials are invalid")]
    InvalidCredentials,
    #[error("authentication is required")]
    AuthenticationRequired,
    #[error("account already exists")]
    Conflict,
    #[error("authentication rate limit exceeded")]
    RateLimited,
    #[error("database operation failed")]
    Database(#[from] SqlxError),
}

impl IntoResponse for AuthServiceError {
    fn into_response(self) -> Response<Body> {
        let (status, error) = match self {
            Self::InvalidSetup | Self::Database(_) => (
                StatusCode::SERVICE_UNAVAILABLE,
                ApiErrorCode::ServiceUnavailable,
            ),
            Self::InvalidRequest => (StatusCode::BAD_REQUEST, ApiErrorCode::InvalidRequest),
            Self::InvalidCredentials => {
                (StatusCode::UNAUTHORIZED, ApiErrorCode::InvalidCredentials)
            }
            Self::AuthenticationRequired => (
                StatusCode::UNAUTHORIZED,
                ApiErrorCode::AuthenticationRequired,
            ),
            Self::Conflict => (StatusCode::CONFLICT, ApiErrorCode::Conflict),
            Self::RateLimited => (StatusCode::TOO_MANY_REQUESTS, ApiErrorCode::RateLimited),
        };
        (
            status,
            Json(ApiErrorBody {
                error,
                request_id: Uuid::new_v4(),
            }),
        )
            .into_response()
    }
}

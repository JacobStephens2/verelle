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
use rand::{RngCore, rngs::OsRng};
use sha2::{Digest, Sha256};
use sqlx_core::{error::Error as SqlxError, query::query, row::Row};
use sqlx_postgres::Postgres;
use std::sync::Arc;
use thiserror::Error;
use uuid::Uuid;
use verelle_api::{
    ApiErrorBody, ApiErrorCode, LoginFinishRequest, LoginFinishResponse, LoginStartRequest,
    LoginStartResponse, OpaqueMessage, RegistrationFinishRequest, RegistrationFinishResponse,
    RegistrationStartRequest, RegistrationStartResponse,
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
        let exists = query::<Postgres>(
            "SELECT EXISTS(SELECT 1 FROM accounts WHERE identifier_hash = $1) AS present",
        )
        .bind(identifier.as_slice())
        .fetch_one(self.database.pool())
        .await?
        .get::<bool, _>("present");
        if exists {
            return Err(AuthServiceError::Conflict);
        }
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

    pub async fn registration_finish(
        &self,
        request: RegistrationFinishRequest,
    ) -> Result<RegistrationFinishResponse, AuthServiceError> {
        let registration_upload = request
            .registration_upload
            .decode()
            .map_err(|_| AuthServiceError::InvalidRequest)?;
        let password_file = server_registration_finish(&registration_upload)
            .map_err(|_| AuthServiceError::InvalidRequest)?;
        let device_public_key =
            decode_bounded(&request.device_public_key, MAX_DEVICE_PUBLIC_KEY_BYTES)?;
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
        let device_id = Uuid::new_v4();
        let dataset_id = Uuid::new_v4();
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
            "INSERT INTO account_devices (device_id, account_id, public_key) VALUES ($1, $2, $3)",
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
            "SELECT account_id, opaque_password_file FROM accounts \
             WHERE identifier_hash = $1 AND disabled_at IS NULL",
        )
        .bind(identifier.as_slice())
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
        query::<Postgres>(
            "INSERT INTO opaque_auth_flows \
             (flow_id, flow_kind, identifier_hash, account_id, opaque_server_state, expires_at) \
             VALUES ($1, 'login', $2, $3, $4, CURRENT_TIMESTAMP + INTERVAL '5 minutes')",
        )
        .bind(flow_id)
        .bind(identifier.as_slice())
        .bind(account_id)
        .bind(started.state)
        .execute(self.database.pool())
        .await?;
        Ok(LoginStartResponse {
            flow_id,
            credential_response: OpaqueMessage::from_bytes(&started.response),
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
        let mut transaction = self.database.pool().begin().await?;
        let flow = query::<Postgres>(
            "SELECT identifier_hash, account_id, opaque_server_state \
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
        let mut server_state = flow.get::<Vec<u8>, _>("opaque_server_state");
        let finish_result = server_login_finish(&server_state, &identifier_hash, &finalization);
        server_state.zeroize();
        let Ok(mut session_key) = finish_result else {
            consume_flow(&mut transaction, request.flow_id).await?;
            transaction.commit().await?;
            return Err(AuthServiceError::InvalidCredentials);
        };
        session_key.zeroize();
        let account_id = account_id.ok_or(AuthServiceError::InvalidCredentials)?;
        let device_exists = query::<Postgres>(
            "SELECT EXISTS(SELECT 1 FROM account_devices \
             WHERE device_id = $1 AND account_id = $2 AND revoked_at IS NULL) AS present",
        )
        .bind(request.device_id)
        .bind(account_id)
        .fetch_one(&mut *transaction)
        .await?
        .get::<bool, _>("present");
        if !device_exists {
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

    async fn enforce_start_rate_limit(
        &self,
        identifier_hash: &[u8; 32],
    ) -> Result<(), AuthServiceError> {
        let count = query::<Postgres>(
            "SELECT COUNT(*)::BIGINT AS count FROM opaque_auth_flows \
             WHERE identifier_hash = $1 \
               AND created_at > CURRENT_TIMESTAMP - INTERVAL '15 minutes'",
        )
        .bind(identifier_hash.as_slice())
        .fetch_one(self.database.pool())
        .await?
        .get::<i64, _>("count");
        if count >= MAX_AUTH_STARTS_PER_IDENTIFIER {
            return Err(AuthServiceError::RateLimited);
        }
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

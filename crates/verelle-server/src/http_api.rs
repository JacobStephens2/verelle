//! Authenticated HTTP transport for the blind relay.
//!
//! The production binary does not mount this router until its authorizer is the
//! reviewed account/session implementation. Tests inject a synthetic authorizer
//! without creating an unauthenticated production fallback.

use crate::relay::{PostgresRelay, RelayStoreError};
use axum::{
    Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, Path, Query, State},
    http::{HeaderMap, StatusCode, header::AUTHORIZATION},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Deserialize;
use std::future::Future;
use uuid::Uuid;
use verelle_api::{
    AcceptedOperation, ApiErrorBody, ApiErrorCode, PullResponse, PushRequest, PushResponse,
    RedactOperationsRequest, RedactOperationsResponse, WireError,
};
use verelle_sync::RelayError;

const MAX_JSON_BODY_BYTES: usize = 1_500_000;
const DEFAULT_PULL_LIMIT: u64 = 100;
const MAX_BEARER_TOKEN_BYTES: usize = 512;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AuthorizedPrincipal {
    pub account_id: Uuid,
    pub device_id: Uuid,
}

pub trait DatasetAuthorizer: Clone + Send + Sync + 'static {
    fn authorize(
        &self,
        bearer_token: String,
        dataset_id: Uuid,
    ) -> impl Future<Output = Option<AuthorizedPrincipal>> + Send;
}

#[derive(Debug, Clone)]
struct SyncState<A> {
    relay: PostgresRelay,
    authorizer: A,
}

pub fn authenticated_sync_router<A>(relay: PostgresRelay, authorizer: A) -> Router
where
    A: DatasetAuthorizer,
{
    Router::new()
        .route(
            "/api/v1/datasets/{dataset_id}/operations",
            get(pull::<A>).post(push::<A>),
        )
        .route(
            "/api/v1/datasets/{dataset_id}/operation-redactions",
            post(redact::<A>),
        )
        .layer(DefaultBodyLimit::max(MAX_JSON_BODY_BYTES))
        .with_state(SyncState { relay, authorizer })
}

async fn redact<A>(
    State(state): State<SyncState<A>>,
    Path(dataset_id): Path<Uuid>,
    headers: HeaderMap,
    Json(request): Json<RedactOperationsRequest>,
) -> Result<Json<RedactOperationsResponse>, HttpApiError>
where
    A: DatasetAuthorizer,
{
    authorize(&state.authorizer, &headers, dataset_id).await?;
    request.validate().map_err(HttpApiError::Wire)?;
    let redacted = state
        .relay
        .redact(dataset_id, &request.operation_ids)
        .await?;
    Ok(Json(RedactOperationsResponse { redacted }))
}

async fn push<A>(
    State(state): State<SyncState<A>>,
    Path(dataset_id): Path<Uuid>,
    headers: HeaderMap,
    Json(request): Json<PushRequest>,
) -> Result<Json<PushResponse>, HttpApiError>
where
    A: DatasetAuthorizer,
{
    authorize(&state.authorizer, &headers, dataset_id).await?;
    let operations = request.decode().map_err(HttpApiError::Wire)?;
    let mut accepted = Vec::with_capacity(operations.len());
    for operation in operations {
        let server_sequence = state.relay.push(dataset_id, &operation).await?;
        accepted.push(AcceptedOperation {
            operation_id: operation.op_id,
            server_sequence,
        });
    }
    Ok(Json(PushResponse { accepted }))
}

#[derive(Debug, Deserialize)]
struct PullQuery {
    after: u64,
    limit: Option<u64>,
}

async fn pull<A>(
    State(state): State<SyncState<A>>,
    Path(dataset_id): Path<Uuid>,
    Query(query): Query<PullQuery>,
    headers: HeaderMap,
) -> Result<Json<PullResponse>, HttpApiError>
where
    A: DatasetAuthorizer,
{
    authorize(&state.authorizer, &headers, dataset_id).await?;
    let page = state
        .relay
        .pull(
            dataset_id,
            query.after,
            query.limit.unwrap_or(DEFAULT_PULL_LIMIT),
        )
        .await?;
    Ok(Json(PullResponse::from(&page)))
}

async fn authorize<A>(
    authorizer: &A,
    headers: &HeaderMap,
    dataset_id: Uuid,
) -> Result<AuthorizedPrincipal, HttpApiError>
where
    A: DatasetAuthorizer,
{
    let token = bearer_token(headers)?;
    authorizer
        .authorize(token, dataset_id)
        .await
        .ok_or(HttpApiError::Forbidden)
}

fn bearer_token(headers: &HeaderMap) -> Result<String, HttpApiError> {
    let value = headers
        .get(AUTHORIZATION)
        .ok_or(HttpApiError::AuthenticationRequired)?
        .to_str()
        .map_err(|_| HttpApiError::AuthenticationRequired)?;
    let token = value
        .strip_prefix("Bearer ")
        .filter(|token| !token.is_empty() && token.len() <= MAX_BEARER_TOKEN_BYTES)
        .ok_or(HttpApiError::AuthenticationRequired)?;
    Ok(token.to_owned())
}

#[derive(Debug)]
enum HttpApiError {
    AuthenticationRequired,
    Forbidden,
    Wire(WireError),
    Relay(RelayStoreError),
}

impl From<RelayStoreError> for HttpApiError {
    fn from(error: RelayStoreError) -> Self {
        Self::Relay(error)
    }
}

impl IntoResponse for HttpApiError {
    fn into_response(self) -> Response<Body> {
        let (status, error) = match self {
            Self::AuthenticationRequired => (
                StatusCode::UNAUTHORIZED,
                ApiErrorCode::AuthenticationRequired,
            ),
            Self::Forbidden => (StatusCode::FORBIDDEN, ApiErrorCode::Forbidden),
            Self::Wire(WireError::PayloadTooLarge | WireError::InvalidEnvelopeSize)
            | Self::Relay(RelayStoreError::Relay(RelayError::EnvelopeTooLarge { .. })) => {
                (StatusCode::PAYLOAD_TOO_LARGE, ApiErrorCode::PayloadTooLarge)
            }
            Self::Wire(_)
            | Self::Relay(
                RelayStoreError::Relay(
                    RelayError::InvalidEpoch
                    | RelayError::InvalidEnvelope
                    | RelayError::EnvelopeEpochMismatch
                    | RelayError::InvalidPageLimit
                    | RelayError::PageLimitTooLarge { .. }
                    | RelayError::CursorAhead { .. },
                )
                | RelayStoreError::SequenceExhausted,
            ) => (StatusCode::BAD_REQUEST, ApiErrorCode::InvalidRequest),
            Self::Relay(RelayStoreError::Relay(RelayError::StaleEpoch { .. })) => {
                (StatusCode::CONFLICT, ApiErrorCode::StaleEpoch)
            }
            Self::Relay(RelayStoreError::RotationPending) => {
                (StatusCode::CONFLICT, ApiErrorCode::RotationPending)
            }
            Self::Relay(
                RelayStoreError::Relay(
                    RelayError::OperationIdConflict | RelayError::RedactedOperation,
                )
                | RelayStoreError::DatasetNotFound,
            ) => (StatusCode::CONFLICT, ApiErrorCode::Conflict),
            Self::Relay(RelayStoreError::InvalidEnvelope) => {
                (StatusCode::BAD_REQUEST, ApiErrorCode::InvalidRequest)
            }
            Self::Relay(RelayStoreError::Database(_)) => (
                StatusCode::SERVICE_UNAVAILABLE,
                ApiErrorCode::ServiceUnavailable,
            ),
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;
    use axum::http::Request;
    use http_body_util::BodyExt;
    use std::time::Duration;
    use tower::ServiceExt;

    #[derive(Debug, Clone)]
    struct SyntheticAuthorizer;

    impl DatasetAuthorizer for SyntheticAuthorizer {
        fn authorize(
            &self,
            bearer_token: String,
            _dataset_id: Uuid,
        ) -> impl Future<Output = Option<AuthorizedPrincipal>> + Send {
            std::future::ready((bearer_token == "synthetic-test-token").then(|| {
                AuthorizedPrincipal {
                    account_id: Uuid::nil(),
                    device_id: Uuid::nil(),
                }
            }))
        }
    }

    fn test_router() -> Router {
        let database = Database::connect_lazy_for_test(
            "postgresql://127.0.0.1:9/verelle_unreachable",
            Duration::from_millis(20),
        );
        authenticated_sync_router(PostgresRelay::new(database), SyntheticAuthorizer)
    }

    #[tokio::test]
    async fn missing_bearer_token_fails_before_database_access() {
        let response = test_router()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(format!(
                        "/api/v1/datasets/{}/operations?after=0",
                        Uuid::new_v4()
                    ))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn invalid_wire_payload_fails_before_database_access() {
        let response = test_router()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/v1/datasets/{}/operations", Uuid::new_v4()))
                    .header(AUTHORIZATION, "Bearer synthetic-test-token")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"operations":[]}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let body: ApiErrorBody = serde_json::from_slice(&body).unwrap();
        assert_eq!(body.error, ApiErrorCode::InvalidRequest);
    }
}

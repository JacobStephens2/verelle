//! Server foundation for Verelle.
//!
//! Only liveness/readiness routes are exposed. Postgres relay primitives are
//! available for verification, but production account and sync HTTP APIs stay
//! absent until ADR 0003 / OQ-9 is closed.

pub mod accounts;
pub mod config;
pub mod database;
pub mod http_api;
pub mod relay;

use axum::{Json, Router, extract::State, http::StatusCode, routing::get};
use database::Database;
use http_api::authenticated_sync_router;
use relay::PostgresRelay;
use serde::Serialize;

#[derive(Debug, Clone)]
struct AppState {
    database: Database,
}

#[derive(Debug, Serialize)]
struct StatusBody {
    service: &'static str,
    status: &'static str,
    authentication: &'static str,
    sync_api: &'static str,
}

pub fn app(database: Database) -> Router {
    Router::new()
        .route("/healthz", get(health))
        .route("/readyz", get(ready))
        .fallback(not_found)
        .with_state(AppState { database })
}

pub fn reviewed_app(database: &Database, auth_service: accounts::AuthService) -> Router {
    let status_router = Router::new()
        .route("/healthz", get(reviewed_health))
        .route("/readyz", get(reviewed_ready))
        .with_state(AppState {
            database: database.clone(),
        });
    accounts::account_router(auth_service.clone())
        .merge(authenticated_sync_router(
            PostgresRelay::new(database.clone()),
            auth_service,
        ))
        .merge(status_router)
        .fallback(reviewed_not_found)
}

async fn health() -> Json<StatusBody> {
    Json(status_body("ok"))
}

async fn reviewed_health() -> Json<StatusBody> {
    Json(reviewed_status_body("ok"))
}

async fn ready(State(state): State<AppState>) -> (StatusCode, Json<StatusBody>) {
    if state.database.ping().await.is_ok() {
        (StatusCode::OK, Json(status_body("ready")))
    } else {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(status_body("database_unavailable")),
        )
    }
}

async fn reviewed_ready(State(state): State<AppState>) -> (StatusCode, Json<StatusBody>) {
    if state.database.ping().await.is_ok() {
        (StatusCode::OK, Json(reviewed_status_body("ready")))
    } else {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(reviewed_status_body("database_unavailable")),
        )
    }
}

async fn not_found() -> (StatusCode, Json<StatusBody>) {
    (StatusCode::NOT_FOUND, Json(status_body("not_found")))
}

async fn reviewed_not_found() -> (StatusCode, Json<StatusBody>) {
    (
        StatusCode::NOT_FOUND,
        Json(reviewed_status_body("not_found")),
    )
}

const fn status_body(status: &'static str) -> StatusBody {
    StatusBody {
        service: "verelle-server",
        status,
        authentication: "blocked_oq9",
        sync_api: "disabled",
    }
}

const fn reviewed_status_body(status: &'static str) -> StatusBody {
    StatusBody {
        service: "verelle-server",
        status,
        authentication: "opaque_rfc9807",
        sync_api: "enabled",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use http_body_util::BodyExt;
    use std::time::Duration;
    use tower::ServiceExt;

    fn disconnected_database() -> Database {
        Database::connect_lazy_for_test(
            "postgresql://127.0.0.1:9/verelle_unreachable",
            Duration::from_millis(50),
        )
    }

    #[tokio::test]
    async fn health_is_live_without_a_database_connection() {
        let response = app(disconnected_database())
            .oneshot(
                axum::http::Request::builder()
                    .uri("/healthz")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let body = String::from_utf8(body.to_vec()).unwrap();
        assert!(body.contains("blocked_oq9"));
        assert!(body.contains("\"sync_api\":\"disabled\""));
    }

    #[tokio::test]
    async fn readiness_fails_closed_when_postgres_is_unavailable() {
        let response = app(disconnected_database())
            .oneshot(
                axum::http::Request::builder()
                    .uri("/readyz")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn production_sync_and_auth_routes_do_not_exist() {
        for path in ["/api/sync", "/api/signup", "/api/login", "/api/sessions"] {
            let response = app(disconnected_database())
                .oneshot(
                    axum::http::Request::builder()
                        .uri(path)
                        .body(axum::body::Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::NOT_FOUND, "path: {path}");
        }
    }
}

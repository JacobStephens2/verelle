use anyhow::{Context, Result};
use tokio::net::TcpListener;
use tracing::info;
use tracing_subscriber::EnvFilter;
use verelle_server::{
    accounts::AuthService, app, config::Config, database::Database, reviewed_app,
};

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_current_span(false)
        .with_span_list(false)
        .init();

    let config = Config::from_environment()?;
    let database = Database::connect(
        &config.database_url,
        config.max_database_connections,
        config.database_acquire_timeout,
    )
    .await
    .context("PostgreSQL connection failed")?;
    database
        .migrate()
        .await
        .context("PostgreSQL migrations failed")?;

    let listener = TcpListener::bind(config.bind_address)
        .await
        .context("server bind failed")?;
    let router = if config.reviewed_api_enabled {
        let review_reference = config
            .oq9_review_reference
            .as_deref()
            .context("OQ-9 review reference is missing")?;
        let server_setup = config
            .opaque_server_setup
            .context("OPAQUE server setup is missing")?;
        let auth_service = AuthService::new(database.clone(), server_setup)
            .context("OPAQUE server setup is invalid")?;
        info!(
            bind_address = %config.bind_address,
            authentication = "opaque_rfc9807",
            sync_api = "enabled",
            oq9_review_reference = review_reference,
            "Verelle reviewed API listening"
        );
        reviewed_app(&database, auth_service)
    } else {
        info!(
            bind_address = %config.bind_address,
            authentication = "blocked_oq9",
            sync_api = "disabled",
            "Verelle server foundation listening"
        );
        app(database)
    };
    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("server failed")?;
    Ok(())
}

async fn shutdown_signal() {
    if let Err(error) = tokio::signal::ctrl_c().await {
        tracing::error!(%error, "failed to install shutdown signal handler");
    }
}

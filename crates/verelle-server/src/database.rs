use sqlx_core::{
    connection::ConnectOptions,
    error::Error,
    migrate::{MigrateError, Migration, MigrationType, Migrator},
    query::query,
};
use sqlx_postgres::{PgConnectOptions, PgPool, PgPoolOptions, Postgres};
use std::{borrow::Cow, str::FromStr, sync::LazyLock, time::Duration};

static MIGRATOR: LazyLock<Migrator> = LazyLock::new(|| Migrator {
    migrations: Cow::Owned(vec![
        Migration::new(
            1,
            Cow::Borrowed("blind relay"),
            MigrationType::Simple,
            Cow::Borrowed(include_str!("../migrations/0001_blind_relay.sql")),
            false,
        ),
        Migration::new(
            2,
            Cow::Borrowed("accounts and sessions"),
            MigrationType::Simple,
            Cow::Borrowed(include_str!("../migrations/0002_accounts_and_sessions.sql")),
            false,
        ),
        Migration::new(
            3,
            Cow::Borrowed("device proof consent and deletion"),
            MigrationType::Simple,
            Cow::Borrowed(include_str!(
                "../migrations/0003_device_proof_consent_deletion.sql"
            )),
            false,
        ),
    ]),
    ..Migrator::DEFAULT
});

#[derive(Debug, Clone)]
pub struct Database {
    pool: PgPool,
}

impl Database {
    pub async fn connect(
        database_url: &str,
        max_connections: u32,
        acquire_timeout: Duration,
    ) -> Result<Self, Error> {
        let options = PgConnectOptions::from_str(database_url)?.disable_statement_logging();
        let pool = PgPoolOptions::new()
            .max_connections(max_connections)
            .acquire_timeout(acquire_timeout)
            .connect_with(options)
            .await?;
        Ok(Self { pool })
    }

    pub fn connect_lazy_for_test(database_url: &str, acquire_timeout: Duration) -> Self {
        let options = PgConnectOptions::from_str(database_url)
            .expect("test database URL must be valid")
            .disable_statement_logging();
        let pool = PgPoolOptions::new()
            .max_connections(1)
            .acquire_timeout(acquire_timeout)
            .connect_lazy_with(options);
        Self { pool }
    }

    pub async fn migrate(&self) -> Result<(), MigrateError> {
        MIGRATOR.run(&self.pool).await
    }

    pub async fn ping(&self) -> Result<(), Error> {
        query::<Postgres>("SELECT 1").execute(&self.pool).await?;
        Ok(())
    }

    pub const fn pool(&self) -> &PgPool {
        &self.pool
    }
}

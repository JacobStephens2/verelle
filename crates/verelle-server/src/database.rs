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
        Migration::new(
            4,
            Cow::Borrowed("account recovery"),
            MigrationType::Simple,
            Cow::Borrowed(include_str!("../migrations/0004_account_recovery.sql")),
            false,
        ),
        Migration::new(
            5,
            Cow::Borrowed("independent deletion ledger"),
            MigrationType::Simple,
            Cow::Borrowed(include_str!(
                "../migrations/0005_independent_deletion_ledger.sql"
            )),
            false,
        ),
        Migration::new(
            6,
            Cow::Borrowed("couple invites"),
            MigrationType::Simple,
            Cow::Borrowed(include_str!("../migrations/0006_couple_invites.sql")),
            false,
        ),
        Migration::new(
            7,
            Cow::Borrowed("subscription entitlements"),
            MigrationType::Simple,
            Cow::Borrowed(include_str!(
                "../migrations/0007_subscription_entitlements.sql"
            )),
            false,
        ),
        Migration::new(
            8,
            Cow::Borrowed("billing event ordering and warnings"),
            MigrationType::Simple,
            Cow::Borrowed(include_str!(
                "../migrations/0008_billing_event_order_and_warnings.sql"
            )),
            false,
        ),
        Migration::new(
            9,
            Cow::Borrowed("dataset unlink and epoch audit"),
            MigrationType::Simple,
            Cow::Borrowed(include_str!("../migrations/0009_dataset_unlink.sql")),
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

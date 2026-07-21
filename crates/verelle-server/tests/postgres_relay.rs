use sqlx_core::{query::query, row::Row};
use sqlx_postgres::Postgres;
use std::{env, time::Duration};
use uuid::Uuid;
use verelle_crypto::{SecretKey, seal};
use verelle_server::{
    database::Database,
    relay::{PostgresRelay, RelayStoreError},
};
use verelle_sync::{RelayError, TransportOp};

fn transport(op_id: Uuid, epoch: u64, message: &[u8]) -> TransportOp {
    let envelope = seal(
        &SecretKey::from_bytes([23_u8; 32]),
        epoch,
        b"verelle/server-integration-test",
        message,
    )
    .unwrap();
    TransportOp {
        op_id,
        key_epoch: epoch,
        envelope: envelope.to_bytes(),
    }
}

#[tokio::test]
#[ignore = "requires an isolated TEST_DATABASE_URL"]
async fn postgres_relay_preserves_blind_idempotent_cursor_semantics() {
    let database_url = env::var("TEST_DATABASE_URL").expect("TEST_DATABASE_URL is required");
    let database = Database::connect(&database_url, 2, Duration::from_secs(2))
        .await
        .unwrap();
    database.migrate().await.unwrap();
    query::<Postgres>("TRUNCATE encrypted_operations, sync_datasets CASCADE")
        .execute(database.pool())
        .await
        .unwrap();

    let dataset_id = Uuid::new_v4();
    query::<Postgres>("INSERT INTO sync_datasets (dataset_id, current_epoch) VALUES ($1, 1)")
        .bind(dataset_id)
        .execute(database.pool())
        .await
        .unwrap();
    let relay = PostgresRelay::new(database.clone());
    let first = transport(Uuid::new_v4(), 1, b"first opaque payload");
    let second = transport(Uuid::new_v4(), 1, b"second opaque payload");

    assert_eq!(relay.push(dataset_id, &first).await.unwrap(), 1);
    assert_eq!(relay.push(dataset_id, &first).await.unwrap(), 1);
    assert!(matches!(
        relay
            .push(dataset_id, &transport(first.op_id, 1, b"different"))
            .await,
        Err(RelayStoreError::Relay(RelayError::OperationIdConflict))
    ));
    assert_eq!(relay.push(dataset_id, &second).await.unwrap(), 2);

    let first_page = relay.pull(dataset_id, 0, 1).await.unwrap();
    assert_eq!(first_page.next_cursor, 1);
    assert!(first_page.more);
    assert_eq!(first_page.operations[0].operation, first);
    let second_page = relay.pull(dataset_id, 1, 100).await.unwrap();
    assert_eq!(second_page.next_cursor, 2);
    assert!(!second_page.more);
    assert_eq!(second_page.operations[0].operation, second);

    assert_eq!(relay.redact(dataset_id, &[first.op_id]).await.unwrap(), 1);
    assert_eq!(relay.redact(dataset_id, &[first.op_id]).await.unwrap(), 0);
    let page_after_redaction = relay.pull(dataset_id, 0, 2).await.unwrap();
    assert_eq!(page_after_redaction.next_cursor, 2);
    assert_eq!(page_after_redaction.operations.len(), 1);
    assert_eq!(page_after_redaction.operations[0].operation, second);
    assert!(matches!(
        relay.push(dataset_id, &first).await,
        Err(RelayStoreError::Relay(RelayError::RedactedOperation))
    ));

    query::<Postgres>("UPDATE sync_datasets SET current_epoch = 2 WHERE dataset_id = $1")
        .bind(dataset_id)
        .execute(database.pool())
        .await
        .unwrap();
    assert!(matches!(
        relay
            .push(dataset_id, &transport(Uuid::new_v4(), 1, b"stale"))
            .await,
        Err(RelayStoreError::Relay(RelayError::StaleEpoch {
            current: 2,
            received: 1
        }))
    ));

    let columns = query::<Postgres>(
        "SELECT column_name FROM information_schema.columns \
         WHERE table_schema = 'public' AND table_name = 'encrypted_operations'",
    )
    .fetch_all(database.pool())
    .await
    .unwrap()
    .into_iter()
    .map(|row| row.get::<String, _>("column_name"))
    .collect::<Vec<_>>();
    for forbidden in ["record_key", "observation", "value", "date", "reading"] {
        assert!(!columns.iter().any(|column| column == forbidden));
    }
}

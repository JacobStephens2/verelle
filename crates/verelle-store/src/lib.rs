//! `SQLite` client store implementing the transaction boundaries in
//! `docs/specs/sync-state-machine.md`.

use rusqlite::{Connection, OptionalExtension, Transaction, TransactionBehavior, params};
use std::{
    collections::BTreeSet,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};
use thiserror::Error;
use uuid::Uuid;
use verelle_core::{
    ExportError, Observation, RecordKey, VersionStamp, observations_to_csv, observations_to_json,
};
use verelle_sync::{OperationMutation, PlainOperation, SyncError, TransportOp, merge_operations};

const LATEST_SCHEMA_VERSION: u32 = 1;

// Schema v1 implements the client portions of SYNC-I1..I9. Health values are local plaintext under
// OS file protection; only encrypted envelopes enter the outbox/server path.
const MIGRATION_1_UP: &str = r"
CREATE TABLE operations (
    op_id TEXT PRIMARY KEY NOT NULL,
    record_key TEXT NOT NULL,
    operation_json TEXT NOT NULL,
    hlc_physical INTEGER NOT NULL,
    hlc_logical INTEGER NOT NULL,
    device_id TEXT NOT NULL,
    server_seq INTEGER UNIQUE,
    created_ms INTEGER NOT NULL
);
CREATE INDEX operations_record_key_idx ON operations(record_key);

CREATE TABLE materialized_records (
    record_key TEXT PRIMARY KEY NOT NULL,
    winner_op_id TEXT NOT NULL REFERENCES operations(op_id),
    observation_json TEXT,
    tombstone INTEGER NOT NULL CHECK(tombstone IN (0, 1))
);

CREATE TABLE outbox (
    op_id TEXT PRIMARY KEY NOT NULL REFERENCES operations(op_id) ON DELETE CASCADE,
    key_epoch INTEGER NOT NULL,
    envelope BLOB NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    queued_ms INTEGER NOT NULL
);

CREATE TABLE sync_state (
    singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
    cursor INTEGER NOT NULL
);
INSERT INTO sync_state(singleton, cursor) VALUES(1, 0);

CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value_json TEXT NOT NULL
);
";

const MIGRATION_1_DOWN: &str = r"
DROP TABLE settings;
DROP TABLE sync_state;
DROP TABLE outbox;
DROP TABLE materialized_records;
DROP INDEX operations_record_key_idx;
DROP TABLE operations;
";

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("SQLite operation failed: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("serialization failed: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("sync invariant failed: {0}")]
    Sync(#[from] SyncError),
    #[error("operation ID was reused with different contents")]
    OperationIdConflict,
    #[error("transport metadata does not match the local operation")]
    TransportMismatch,
    #[error("a queued operation ID was reused with different transport bytes")]
    QueuedTransportConflict,
    #[error("the outbox cannot contain mixed key epochs")]
    MixedEpochOutbox,
    #[error("epoch rotation must replace the complete queued operation set")]
    OutboxSetMismatch,
    #[error("pull page starts at cursor {page_cursor}, but the local cursor is {local_cursor}")]
    CursorMismatch { local_cursor: u64, page_cursor: u64 },
    #[error("server sequence {sequence} is outside pull page ({after_cursor}, {next_cursor}]")]
    InvalidPullPage {
        after_cursor: u64,
        next_cursor: u64,
        sequence: u64,
    },
    #[error("server pull watermark moved backward from {after_cursor} to {next_cursor}")]
    CursorWatermarkRewind { after_cursor: u64, next_cursor: u64 },
    #[error("integer is outside SQLite's supported range")]
    IntegerRange,
    #[error("export failed: {0}")]
    Export(#[from] ExportError),
    #[error("record must have a winning tombstone before plaintext history can be purged")]
    RecordNotTombstoned,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppendOutcome {
    Inserted,
    Duplicate,
}

#[derive(Debug, Clone)]
pub struct RemoteOperation {
    pub server_seq: u64,
    pub operation: PlainOperation,
}

#[derive(Debug, Clone)]
pub struct RemotePage {
    pub after_cursor: u64,
    pub next_cursor: u64,
    pub operations: Vec<RemoteOperation>,
}

pub struct Store {
    connection: Connection,
}

impl Store {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, StoreError> {
        let connection = Connection::open(path)?;
        Self::from_connection(connection)
    }

    pub fn open_in_memory() -> Result<Self, StoreError> {
        Self::from_connection(Connection::open_in_memory()?)
    }

    fn from_connection(connection: Connection) -> Result<Self, StoreError> {
        connection.execute_batch(
            "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;",
        )?;
        let mut store = Self { connection };
        store.migrate_to_latest()?;
        Ok(store)
    }

    pub fn schema_version(&self) -> Result<u32, StoreError> {
        let exists: bool = self.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations')",
            [],
            |row| row.get(0),
        )?;
        if !exists {
            return Ok(0);
        }
        let version: Option<u32> =
            self.connection
                .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
                    row.get(0)
                })?;
        Ok(version.unwrap_or(0))
    }

    pub fn migrate_to_latest(&mut self) -> Result<(), StoreError> {
        self.connection.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_ms INTEGER NOT NULL);",
        )?;
        if self.schema_version()? < 1 {
            let transaction = self
                .connection
                .transaction_with_behavior(TransactionBehavior::Immediate)?;
            transaction.execute_batch(MIGRATION_1_UP)?;
            transaction.execute(
                "INSERT INTO schema_migrations(version, applied_ms) VALUES(1, ?1)",
                [now_ms()?],
            )?;
            transaction.commit()?;
        }
        debug_assert_eq!(self.schema_version()?, LATEST_SCHEMA_VERSION);
        Ok(())
    }

    pub fn migrate_down_one(&mut self) -> Result<(), StoreError> {
        match self.schema_version()? {
            0 => Ok(()),
            1 => {
                let transaction = self
                    .connection
                    .transaction_with_behavior(TransactionBehavior::Immediate)?;
                transaction.execute_batch(MIGRATION_1_DOWN)?;
                transaction.execute("DELETE FROM schema_migrations WHERE version = 1", [])?;
                transaction.commit()?;
                Ok(())
            }
            _ => Err(StoreError::IntegerRange),
        }
    }

    /// Atomically persists the plaintext operation, updates the local chart,
    /// and queues the already-encrypted wire envelope.
    pub fn append_local(
        &mut self,
        operation: &PlainOperation,
        transport: &TransportOp,
    ) -> Result<AppendOutcome, StoreError> {
        operation.validate()?;
        transport.validate()?;
        if operation.op_id != transport.op_id {
            return Err(StoreError::TransportMismatch);
        }
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let mixed_epoch: bool = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM outbox WHERE key_epoch != ?1)",
            [to_sql_i64(transport.key_epoch)?],
            |row| row.get(0),
        )?;
        if mixed_epoch {
            return Err(StoreError::MixedEpochOutbox);
        }
        let inserted = insert_operation(&transaction, operation, None)?;
        if !inserted {
            let queued: Option<(i64, Vec<u8>)> = transaction
                .query_row(
                    "SELECT key_epoch, envelope FROM outbox WHERE op_id = ?1",
                    [operation.op_id.to_string()],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()?;
            if queued.is_some_and(|(key_epoch, envelope)| {
                u64::try_from(key_epoch).ok() != Some(transport.key_epoch)
                    || envelope != transport.envelope
            }) {
                return Err(StoreError::QueuedTransportConflict);
            }
            transaction.commit()?;
            return Ok(AppendOutcome::Duplicate);
        }
        update_materialized(&transaction, operation)?;
        transaction.execute(
            "INSERT INTO outbox(op_id, key_epoch, envelope, attempt_count, queued_ms) VALUES(?1, ?2, ?3, 0, ?4)",
            params![
                operation.op_id.to_string(),
                to_sql_i64(transport.key_epoch)?,
                &transport.envelope,
                now_ms()?,
            ],
        )?;
        transaction.commit()?;
        Ok(AppendOutcome::Inserted)
    }

    /// Applies every visible operation in a pull page and advances to the
    /// server-supplied watermark in the same transaction. Sequence gaps are
    /// valid because deletion manifests may redact ciphertext rows.
    pub fn apply_remote_page(&mut self, mut page: RemotePage) -> Result<(), StoreError> {
        page.operations.sort_by_key(|item| item.server_seq);
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let cursor = read_cursor(&transaction)?;
        if cursor != page.after_cursor {
            return Err(StoreError::CursorMismatch {
                local_cursor: cursor,
                page_cursor: page.after_cursor,
            });
        }
        if page.next_cursor < page.after_cursor {
            return Err(StoreError::CursorWatermarkRewind {
                after_cursor: page.after_cursor,
                next_cursor: page.next_cursor,
            });
        }
        let mut previous_sequence = page.after_cursor;
        for remote in page.operations {
            if remote.server_seq <= previous_sequence || remote.server_seq > page.next_cursor {
                return Err(StoreError::InvalidPullPage {
                    after_cursor: page.after_cursor,
                    next_cursor: page.next_cursor,
                    sequence: remote.server_seq,
                });
            }
            remote.operation.validate()?;
            let inserted =
                insert_operation(&transaction, &remote.operation, Some(remote.server_seq))?;
            if inserted {
                update_materialized(&transaction, &remote.operation)?;
            }
            transaction.execute(
                "DELETE FROM outbox WHERE op_id = ?1",
                [remote.operation.op_id.to_string()],
            )?;
            previous_sequence = remote.server_seq;
        }
        transaction.execute(
            "UPDATE sync_state SET cursor = ?1 WHERE singleton = 1",
            [to_sql_i64(page.next_cursor)?],
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub fn acknowledge_pushed(&mut self, op_ids: &[Uuid]) -> Result<(), StoreError> {
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        for op_id in op_ids {
            transaction.execute("DELETE FROM outbox WHERE op_id = ?1", [op_id.to_string()])?;
        }
        transaction.commit()?;
        Ok(())
    }

    pub fn pending_outbox(&self, limit: usize) -> Result<Vec<TransportOp>, StoreError> {
        let mut statement = self.connection.prepare(
            "SELECT op_id, key_epoch, envelope FROM outbox ORDER BY queued_ms, rowid LIMIT ?1",
        )?;
        let rows = statement.query_map(
            [i64::try_from(limit).map_err(|_| StoreError::IntegerRange)?],
            |row| {
                let op_id: String = row.get(0)?;
                let key_epoch: i64 = row.get(1)?;
                let envelope: Vec<u8> = row.get(2)?;
                Ok((op_id, key_epoch, envelope))
            },
        )?;
        rows.map(|row| {
            let (op_id, key_epoch, envelope) = row?;
            Ok(TransportOp {
                op_id: Uuid::parse_str(&op_id).map_err(|_| StoreError::OperationIdConflict)?,
                key_epoch: u64::try_from(key_epoch).map_err(|_| StoreError::IntegerRange)?,
                envelope,
            })
        })
        .collect()
    }

    pub fn queued_plain_operations(&self) -> Result<Vec<PlainOperation>, StoreError> {
        let mut statement = self.connection.prepare(
            "SELECT o.operation_json FROM outbox q JOIN operations o ON o.op_id = q.op_id ORDER BY q.queued_ms, q.rowid",
        )?;
        let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
        rows.map(|row| Ok(serde_json::from_str(&row?)?)).collect()
    }

    /// Atomically replaces every supplied queued envelope during an epoch
    /// rotation. Plaintext operations and materialized chart rows do not move.
    pub fn replace_outbox_batch(&mut self, replacements: &[TransportOp]) -> Result<(), StoreError> {
        replacements.iter().try_for_each(TransportOp::validate)?;
        if replacements
            .iter()
            .map(|transport| transport.key_epoch)
            .collect::<BTreeSet<_>>()
            .len()
            > 1
        {
            return Err(StoreError::MixedEpochOutbox);
        }
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let queued_ids = {
            let mut statement = transaction.prepare("SELECT op_id FROM outbox")?;
            statement
                .query_map([], |row| row.get::<_, String>(0))?
                .collect::<Result<BTreeSet<_>, _>>()?
        };
        let replacement_ids: BTreeSet<String> = replacements
            .iter()
            .map(|transport| transport.op_id.to_string())
            .collect();
        if queued_ids != replacement_ids || replacement_ids.len() != replacements.len() {
            return Err(StoreError::OutboxSetMismatch);
        }
        for transport in replacements {
            transaction.execute(
                "UPDATE outbox SET key_epoch = ?1, envelope = ?2, attempt_count = 0 WHERE op_id = ?3",
                params![
                    to_sql_i64(transport.key_epoch)?,
                    &transport.envelope,
                    transport.op_id.to_string(),
                ],
            )?;
        }
        transaction.commit()?;
        Ok(())
    }

    pub fn mark_push_attempt(&mut self, op_ids: &[Uuid]) -> Result<(), StoreError> {
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        for op_id in op_ids {
            transaction.execute(
                "UPDATE outbox SET attempt_count = attempt_count + 1 WHERE op_id = ?1",
                [op_id.to_string()],
            )?;
        }
        transaction.commit()?;
        Ok(())
    }

    pub fn cursor(&self) -> Result<u64, StoreError> {
        let raw: i64 = self.connection.query_row(
            "SELECT cursor FROM sync_state WHERE singleton = 1",
            [],
            |row| row.get(0),
        )?;
        u64::try_from(raw).map_err(|_| StoreError::IntegerRange)
    }

    /// Highest clock value present in the durable operation log. A restarted
    /// device seeds its HLC from this value before accepting another write.
    pub fn max_version_seen(&self) -> Result<Option<VersionStamp>, StoreError> {
        self.connection
            .query_row(
                "SELECT hlc_physical, hlc_logical, device_id FROM operations ORDER BY hlc_physical DESC, hlc_logical DESC, device_id DESC LIMIT 1",
                [],
                |row| {
                    let physical_ms: i64 = row.get(0)?;
                    let logical: i64 = row.get(1)?;
                    let device_id: String = row.get(2)?;
                    Ok((physical_ms, logical, device_id))
                },
            )
            .optional()?
            .map(|(physical_ms, logical, device_id)| {
                Ok(VersionStamp::new(
                    physical_ms,
                    u32::try_from(logical).map_err(|_| StoreError::IntegerRange)?,
                    device_id,
                ))
            })
            .transpose()
    }

    pub fn materialized_observations(&self) -> Result<Vec<Observation>, StoreError> {
        let mut statement = self.connection.prepare(
            "SELECT observation_json FROM materialized_records WHERE tombstone = 0 ORDER BY record_key",
        )?;
        let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
        rows.map(|row| Ok(serde_json::from_str(&row?)?)).collect()
    }

    /// Returns every known operation superseded by the current winner for a
    /// logical record. For deletion, capture these IDs in the authenticated
    /// server-redaction request before purging their local plaintext.
    pub fn superseded_operation_ids(
        &self,
        record_key: &RecordKey,
    ) -> Result<Vec<Uuid>, StoreError> {
        let mut statement = self.connection.prepare(
            "SELECT o.op_id FROM operations o JOIN materialized_records m ON m.record_key = o.record_key WHERE o.record_key = ?1 AND o.op_id != m.winner_op_id ORDER BY o.op_id",
        )?;
        let rows = statement.query_map([record_key.to_string()], |row| row.get::<_, String>(0))?;
        rows.map(|row| Uuid::parse_str(&row?).map_err(|_| StoreError::OperationIdConflict))
            .collect()
    }

    /// Purges locally stored plaintext only after the caller has received an
    /// idempotent server-redaction acknowledgement for `redacted_op_ids` (or
    /// immediately for a local-only dataset). The winning tombstone remains.
    /// Unknown/already-purged IDs are harmless, making response-loss retries
    /// idempotent.
    pub fn purge_redacted_operations(
        &mut self,
        record_key: &RecordKey,
        redacted_op_ids: &[Uuid],
    ) -> Result<usize, StoreError> {
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let winner: Option<(String, bool)> = transaction
            .query_row(
                "SELECT winner_op_id, tombstone FROM materialized_records WHERE record_key = ?1",
                [record_key.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        let Some((winner_op_id, true)) = winner else {
            return Err(StoreError::RecordNotTombstoned);
        };

        let mut purged = 0;
        for op_id in redacted_op_ids {
            if op_id.to_string() == winner_op_id {
                continue;
            }
            purged += transaction.execute(
                "DELETE FROM operations WHERE op_id = ?1 AND record_key = ?2",
                params![op_id.to_string(), record_key.to_string()],
            )?;
        }
        transaction.commit()?;
        Ok(purged)
    }

    /// Returns true only before this store has recorded or pulled any
    /// operation. Identity/key replacement is safe only in this state.
    pub fn is_pristine(&self) -> Result<bool, StoreError> {
        let has_operations: bool = self.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM operations LIMIT 1)",
            [],
            |row| row.get(0),
        )?;
        Ok(!has_operations && self.cursor()? == 0)
    }

    pub fn export_json(&self) -> Result<String, StoreError> {
        Ok(observations_to_json(&self.materialized_observations()?)?)
    }

    pub fn export_csv(&self) -> Result<String, StoreError> {
        Ok(observations_to_csv(&self.materialized_observations()?)?)
    }

    pub fn set_setting<T: serde::Serialize>(&self, key: &str, value: &T) -> Result<(), StoreError> {
        let value = serde_json::to_string(value)?;
        self.connection.execute(
            "INSERT INTO settings(key, value_json) VALUES(?1, ?2) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
            params![key, value],
        )?;
        Ok(())
    }

    /// Atomically replaces a small group of JSON settings. This is used when
    /// client identity fields must never be observed from different epochs.
    pub fn set_settings_atomically(
        &mut self,
        settings: &[(&str, serde_json::Value)],
    ) -> Result<(), StoreError> {
        let transaction = self.connection.transaction()?;
        for (key, value) in settings {
            transaction.execute(
                "INSERT INTO settings(key, value_json) VALUES(?1, ?2) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
                params![key, serde_json::to_string(value)?],
            )?;
        }
        transaction.commit()?;
        Ok(())
    }

    pub fn setting<T: serde::de::DeserializeOwned>(
        &self,
        key: &str,
    ) -> Result<Option<T>, StoreError> {
        let value: Option<String> = self
            .connection
            .query_row(
                "SELECT value_json FROM settings WHERE key = ?1",
                [key],
                |row| row.get(0),
            )
            .optional()?;
        value
            .map(|json| serde_json::from_str(&json).map_err(StoreError::from))
            .transpose()
    }
}

fn insert_operation(
    transaction: &Transaction<'_>,
    operation: &PlainOperation,
    server_seq: Option<u64>,
) -> Result<bool, StoreError> {
    let op_id = operation.op_id.to_string();
    let json = serde_json::to_string(operation)?;
    let existing: Option<(String, Option<i64>)> = transaction
        .query_row(
            "SELECT operation_json, server_seq FROM operations WHERE op_id = ?1",
            [&op_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    if let Some((existing_json, existing_seq)) = existing {
        if existing_json != json {
            return Err(StoreError::OperationIdConflict);
        }
        if let Some(server_seq) = server_seq {
            let server_seq = to_sql_i64(server_seq)?;
            if existing_seq.is_some_and(|value| value != server_seq) {
                return Err(StoreError::OperationIdConflict);
            }
            transaction.execute(
                "UPDATE operations SET server_seq = COALESCE(server_seq, ?1) WHERE op_id = ?2",
                params![server_seq, op_id],
            )?;
        }
        return Ok(false);
    }
    transaction.execute(
        "INSERT INTO operations(op_id, record_key, operation_json, hlc_physical, hlc_logical, device_id, server_seq, created_ms) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            op_id,
            operation.record_key.to_string(),
            json,
            operation.version.physical_ms,
            i64::from(operation.version.logical),
            &operation.version.device_id,
            server_seq.map(to_sql_i64).transpose()?,
            now_ms()?,
        ],
    )?;
    Ok(true)
}

fn update_materialized(
    transaction: &Transaction<'_>,
    operation: &PlainOperation,
) -> Result<(), StoreError> {
    let key = operation.record_key.to_string();
    let current_json: Option<String> = transaction
        .query_row(
            "SELECT o.operation_json FROM materialized_records m JOIN operations o ON o.op_id = m.winner_op_id WHERE m.record_key = ?1",
            [&key],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(current_json) = current_json {
        let current: PlainOperation = serde_json::from_str(&current_json)?;
        let merged = merge_operations([current, operation.clone()])?;
        if merged[&operation.record_key].winner_op_id != operation.op_id {
            return Ok(());
        }
    }
    let (observation_json, tombstone) = match &operation.mutation {
        OperationMutation::Upsert { observation } => (Some(serde_json::to_string(observation)?), 0),
        OperationMutation::Tombstone => (None, 1),
    };
    transaction.execute(
        "INSERT INTO materialized_records(record_key, winner_op_id, observation_json, tombstone) VALUES(?1, ?2, ?3, ?4) ON CONFLICT(record_key) DO UPDATE SET winner_op_id = excluded.winner_op_id, observation_json = excluded.observation_json, tombstone = excluded.tombstone",
        params![key, operation.op_id.to_string(), observation_json, tombstone],
    )?;
    Ok(())
}

fn read_cursor(transaction: &Transaction<'_>) -> Result<u64, StoreError> {
    let cursor: i64 = transaction.query_row(
        "SELECT cursor FROM sync_state WHERE singleton = 1",
        [],
        |row| row.get(0),
    )?;
    u64::try_from(cursor).map_err(|_| StoreError::IntegerRange)
}

fn to_sql_i64(value: u64) -> Result<i64, StoreError> {
    i64::try_from(value).map_err(|_| StoreError::IntegerRange)
}

fn now_ms() -> Result<i64, StoreError> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| StoreError::IntegerRange)?
        .as_millis();
    i64::try_from(millis).map_err(|_| StoreError::IntegerRange)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;
    use tempfile::NamedTempFile;
    use verelle_core::{BleedingIntensity, ObservationValue, VersionStamp};
    use verelle_crypto::SecretKey;
    use verelle_sync::{PlainOperation, encrypt_operation};

    fn operation(device: &str, physical_ms: i64) -> PlainOperation {
        PlainOperation::upsert(Observation {
            id: Uuid::new_v4(),
            date: NaiveDate::from_ymd_opt(2026, 7, 18).unwrap(),
            value: ObservationValue::Bleeding {
                intensity: BleedingIntensity::Moderate,
            },
            recorded_by: device.to_owned(),
            version: VersionStamp::new(physical_ms, 0, device),
        })
    }

    #[test]
    fn migrations_go_up_down_and_up_again() {
        let mut store = Store::open_in_memory().unwrap();
        assert_eq!(store.schema_version().unwrap(), 1);
        store.migrate_down_one().unwrap();
        assert_eq!(store.schema_version().unwrap(), 0);
        store.migrate_to_latest().unwrap();
        assert_eq!(store.schema_version().unwrap(), 1);
    }

    #[test]
    fn acknowledged_local_commit_is_materialized_and_queued_atomically() {
        let mut store = Store::open_in_memory().unwrap();
        let op = operation("a", 1);
        let transport = encrypt_operation(&SecretKey::random(), 1, Uuid::nil(), &op).unwrap();
        assert_eq!(
            store.append_local(&op, &transport).unwrap(),
            AppendOutcome::Inserted
        );
        assert_eq!(store.materialized_observations().unwrap().len(), 1);
        assert_eq!(store.pending_outbox(10).unwrap(), vec![transport.clone()]);
        assert_eq!(
            store.append_local(&op, &transport).unwrap(),
            AppendOutcome::Duplicate
        );
        assert_eq!(store.pending_outbox(10).unwrap().len(), 1);
    }

    #[test]
    fn duplicate_retry_must_reuse_identical_transport_bytes() {
        let mut store = Store::open_in_memory().unwrap();
        let op = operation("a", 1);
        let key = SecretKey::random();
        let first = encrypt_operation(&key, 1, Uuid::nil(), &op).unwrap();
        let re_encrypted = encrypt_operation(&key, 1, Uuid::nil(), &op).unwrap();
        assert_ne!(first.envelope, re_encrypted.envelope);
        store.append_local(&op, &first).unwrap();
        assert!(matches!(
            store.append_local(&op, &re_encrypted),
            Err(StoreError::QueuedTransportConflict)
        ));
        assert_eq!(store.pending_outbox(10).unwrap(), vec![first]);
    }

    #[test]
    fn local_commit_cannot_create_a_mixed_epoch_outbox() {
        let mut store = Store::open_in_memory().unwrap();
        let first = operation("a", 1);
        let second =
            PlainOperation::tombstone(first.record_key.clone(), VersionStamp::new(2, 0, "a"));
        let key = SecretKey::random();
        let first_wire = encrypt_operation(&key, 1, Uuid::nil(), &first).unwrap();
        let second_wire = encrypt_operation(&key, 2, Uuid::nil(), &second).unwrap();
        store.append_local(&first, &first_wire).unwrap();
        assert!(matches!(
            store.append_local(&second, &second_wire),
            Err(StoreError::MixedEpochOutbox)
        ));
        assert_eq!(store.pending_outbox(10).unwrap(), vec![first_wire]);
        assert_eq!(store.materialized_observations().unwrap().len(), 1);
    }

    #[test]
    fn injected_outbox_failure_rolls_back_operation_and_chart() {
        let mut store = Store::open_in_memory().unwrap();
        store.connection.execute_batch(
            "CREATE TRIGGER fail_outbox BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END;",
        ).unwrap();
        let op = operation("a", 1);
        let transport = encrypt_operation(&SecretKey::random(), 1, Uuid::nil(), &op).unwrap();
        assert!(matches!(
            store.append_local(&op, &transport),
            Err(StoreError::Sqlite(_))
        ));
        assert!(store.materialized_observations().unwrap().is_empty());
        assert!(store.pending_outbox(10).unwrap().is_empty());
    }

    #[test]
    fn storage_exhaustion_fails_the_write_without_acknowledged_state() {
        let mut store = Store::open_in_memory().unwrap();
        let page_count: i64 = store
            .connection
            .query_row("PRAGMA page_count", [], |row| row.get(0))
            .unwrap();
        store
            .connection
            .pragma_update(None, "max_page_count", page_count)
            .unwrap();

        let mut op = operation("a", 1);
        let OperationMutation::Upsert { observation } = &mut op.mutation else {
            unreachable!();
        };
        observation.value = ObservationValue::Note {
            text: "x".repeat(100 * 1024),
        };
        op.record_key = observation.record_key();
        let transport = encrypt_operation(&SecretKey::random(), 1, Uuid::nil(), &op).unwrap();
        let error = store.append_local(&op, &transport).unwrap_err();
        assert!(matches!(
            error,
            StoreError::Sqlite(rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error {
                    code: rusqlite::ErrorCode::DiskFull,
                    ..
                },
                _
            ))
        ));
        assert!(store.materialized_observations().unwrap().is_empty());
        assert!(store.pending_outbox(10).unwrap().is_empty());
        assert!(store.max_version_seen().unwrap().is_none());
    }

    #[test]
    fn response_loss_retry_and_pull_echo_are_idempotent() {
        let mut store = Store::open_in_memory().unwrap();
        let op = operation("a", 1);
        let transport = encrypt_operation(&SecretKey::random(), 1, Uuid::nil(), &op).unwrap();
        store.append_local(&op, &transport).unwrap();
        store.mark_push_attempt(&[op.op_id]).unwrap();
        store.mark_push_attempt(&[op.op_id]).unwrap();
        assert_eq!(store.pending_outbox(10).unwrap().len(), 1);
        store
            .apply_remote_page(RemotePage {
                after_cursor: 0,
                next_cursor: 1,
                operations: vec![RemoteOperation {
                    server_seq: 1,
                    operation: op,
                }],
            })
            .unwrap();
        assert_eq!(store.cursor().unwrap(), 1);
        assert!(store.pending_outbox(10).unwrap().is_empty());
        assert_eq!(store.materialized_observations().unwrap().len(), 1);
    }

    #[test]
    fn invalid_page_rolls_back_without_advancing_cursor() {
        let mut store = Store::open_in_memory().unwrap();
        let result = store.apply_remote_page(RemotePage {
            after_cursor: 0,
            next_cursor: 1,
            operations: vec![RemoteOperation {
                server_seq: 2,
                operation: operation("b", 2),
            }],
        });
        assert!(matches!(
            result,
            Err(StoreError::InvalidPullPage {
                after_cursor: 0,
                next_cursor: 1,
                sequence: 2
            })
        ));
        assert_eq!(store.cursor().unwrap(), 0);
        assert!(store.materialized_observations().unwrap().is_empty());
    }

    #[test]
    fn redacted_sequence_gap_advances_to_server_watermark() {
        let mut store = Store::open_in_memory().unwrap();
        store
            .apply_remote_page(RemotePage {
                after_cursor: 0,
                next_cursor: 2,
                operations: vec![RemoteOperation {
                    server_seq: 2,
                    operation: operation("b", 2),
                }],
            })
            .unwrap();
        assert_eq!(store.cursor().unwrap(), 2);
        assert_eq!(store.materialized_observations().unwrap().len(), 1);
    }

    #[test]
    fn pull_watermark_cannot_move_backward() {
        let mut store = Store::open_in_memory().unwrap();
        store
            .apply_remote_page(RemotePage {
                after_cursor: 0,
                next_cursor: 2,
                operations: Vec::new(),
            })
            .unwrap();
        let error = store.apply_remote_page(RemotePage {
            after_cursor: 2,
            next_cursor: 1,
            operations: Vec::new(),
        });
        assert!(matches!(
            error,
            Err(StoreError::CursorWatermarkRewind {
                after_cursor: 2,
                next_cursor: 1
            })
        ));
        assert_eq!(store.cursor().unwrap(), 2);
    }

    #[test]
    fn persistence_survives_process_reopen() {
        let file = NamedTempFile::new().unwrap();
        let op = operation("a", 1);
        let transport = encrypt_operation(&SecretKey::random(), 1, Uuid::nil(), &op).unwrap();
        {
            let mut store = Store::open(file.path()).unwrap();
            store.append_local(&op, &transport).unwrap();
        }
        let store = Store::open(file.path()).unwrap();
        assert_eq!(store.materialized_observations().unwrap().len(), 1);
        assert_eq!(store.pending_outbox(10).unwrap().len(), 1);
        assert_eq!(store.max_version_seen().unwrap(), Some(op.version));
    }

    #[test]
    fn concurrent_writer_contention_never_exposes_a_partial_commit() {
        let file = NamedTempFile::new().unwrap();
        let mut first = Store::open(file.path()).unwrap();
        let mut second = Store::open(file.path()).unwrap();
        second
            .connection
            .busy_timeout(std::time::Duration::from_millis(10))
            .unwrap();
        let lock = first
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .unwrap();

        let op = operation("b", 1);
        let wire = encrypt_operation(&SecretKey::random(), 1, Uuid::nil(), &op).unwrap();
        let error = second.append_local(&op, &wire).unwrap_err();
        assert!(matches!(
            error,
            StoreError::Sqlite(rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error {
                    code: rusqlite::ErrorCode::DatabaseBusy,
                    ..
                },
                _
            ))
        ));
        assert!(second.materialized_observations().unwrap().is_empty());
        assert!(second.pending_outbox(10).unwrap().is_empty());

        lock.rollback().unwrap();
        second.append_local(&op, &wire).unwrap();
        assert_eq!(second.materialized_observations().unwrap().len(), 1);
        assert_eq!(second.pending_outbox(10).unwrap(), vec![wire]);
    }

    #[test]
    fn epoch_rotation_replaces_queued_ciphertext_without_touching_plaintext() {
        let mut store = Store::open_in_memory().unwrap();
        let op = operation("a", 1);
        let old = encrypt_operation(&SecretKey::random(), 1, Uuid::nil(), &op).unwrap();
        store.append_local(&op, &old).unwrap();
        let replacement = encrypt_operation(&SecretKey::random(), 2, Uuid::nil(), &op).unwrap();
        store
            .replace_outbox_batch(std::slice::from_ref(&replacement))
            .unwrap();
        assert_eq!(store.pending_outbox(10).unwrap(), vec![replacement]);
        assert_eq!(store.queued_plain_operations().unwrap(), vec![op]);
    }

    #[test]
    fn epoch_rotation_rejects_a_partial_queue_replacement() {
        let mut store = Store::open_in_memory().unwrap();
        let first = operation("a", 1);
        let second =
            PlainOperation::tombstone(first.record_key.clone(), VersionStamp::new(2, 0, "a"));
        let old_key = SecretKey::random();
        let first_old = encrypt_operation(&old_key, 1, Uuid::nil(), &first).unwrap();
        let second_old = encrypt_operation(&old_key, 1, Uuid::nil(), &second).unwrap();
        store.append_local(&first, &first_old).unwrap();
        store.append_local(&second, &second_old).unwrap();

        let replacement = encrypt_operation(&SecretKey::random(), 2, Uuid::nil(), &first).unwrap();
        assert!(matches!(
            store.replace_outbox_batch(&[replacement]),
            Err(StoreError::OutboxSetMismatch)
        ));
        assert!(
            store
                .pending_outbox(10)
                .unwrap()
                .iter()
                .all(|item| item.key_epoch == 1)
        );
    }

    #[test]
    fn epoch_rotation_rejects_mixed_epoch_replacements() {
        let mut store = Store::open_in_memory().unwrap();
        let first = operation("a", 1);
        let second =
            PlainOperation::tombstone(first.record_key.clone(), VersionStamp::new(2, 0, "a"));
        let old_key = SecretKey::random();
        for operation in [&first, &second] {
            let wire = encrypt_operation(&old_key, 1, Uuid::nil(), operation).unwrap();
            store.append_local(operation, &wire).unwrap();
        }

        let new_key = SecretKey::random();
        let replacements = [
            encrypt_operation(&new_key, 2, Uuid::nil(), &first).unwrap(),
            encrypt_operation(&new_key, 3, Uuid::nil(), &second).unwrap(),
        ];
        assert!(matches!(
            store.replace_outbox_batch(&replacements),
            Err(StoreError::MixedEpochOutbox)
        ));
        assert!(
            store
                .pending_outbox(10)
                .unwrap()
                .iter()
                .all(|item| item.key_epoch == 1)
        );
    }

    #[test]
    fn acknowledged_redaction_purges_superseded_plaintext_and_keeps_tombstone() {
        let mut store = Store::open_in_memory().unwrap();
        let key = SecretKey::random();
        let couple_id = Uuid::new_v4();
        let first = operation("a", 1);
        let second = operation("a", 2);
        let tombstone =
            PlainOperation::tombstone(first.record_key.clone(), VersionStamp::new(3, 0, "a"));
        for operation in [&first, &second, &tombstone] {
            let transport = encrypt_operation(&key, 1, couple_id, operation).unwrap();
            store.append_local(operation, &transport).unwrap();
        }

        assert!(store.materialized_observations().unwrap().is_empty());
        let redaction_ids = store.superseded_operation_ids(&first.record_key).unwrap();
        assert_eq!(
            redaction_ids.iter().copied().collect::<BTreeSet<_>>(),
            [first.op_id, second.op_id].into_iter().collect()
        );
        assert_eq!(
            store
                .purge_redacted_operations(&first.record_key, &redaction_ids)
                .unwrap(),
            2
        );
        assert!(
            store
                .superseded_operation_ids(&first.record_key)
                .unwrap()
                .is_empty()
        );
        assert_eq!(store.pending_outbox(10).unwrap().len(), 1);
        assert_eq!(store.queued_plain_operations().unwrap(), vec![tombstone]);
        assert_eq!(
            store
                .purge_redacted_operations(&first.record_key, &redaction_ids)
                .unwrap(),
            0
        );
    }

    #[test]
    fn plaintext_purge_requires_a_winning_tombstone() {
        let mut store = Store::open_in_memory().unwrap();
        let operation = operation("a", 1);
        let transport =
            encrypt_operation(&SecretKey::random(), 1, Uuid::new_v4(), &operation).unwrap();
        store.append_local(&operation, &transport).unwrap();
        assert!(matches!(
            store.purge_redacted_operations(&operation.record_key, &[operation.op_id]),
            Err(StoreError::RecordNotTombstoned)
        ));
    }
}

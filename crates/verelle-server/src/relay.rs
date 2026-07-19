use crate::database::Database;
use sqlx_core::{error::Error as SqlxError, query::query, row::Row};
use sqlx_postgres::Postgres;
use thiserror::Error;
use uuid::Uuid;
use verelle_crypto::EncryptedEnvelope;
use verelle_sync::{RelayError, SequencedTransportOp, TransportOp, TransportPage};

pub const MAX_PAGE_OPERATIONS: u64 = 100;
pub const MAX_PAGE_BYTES: usize = 1024 * 1024;
pub const MAX_ENVELOPE_BYTES: usize = 256 * 1024;

#[derive(Debug, Error)]
pub enum RelayStoreError {
    #[error(transparent)]
    Relay(#[from] RelayError),
    #[error("dataset does not exist")]
    DatasetNotFound,
    #[error("dataset key rotation is pending")]
    RotationPending,
    #[error("encrypted envelope is empty, malformed, or exceeds the relay limit")]
    InvalidEnvelope,
    #[error("dataset sequence space is exhausted")]
    SequenceExhausted,
    #[error("database operation failed")]
    Database(#[source] SqlxError),
}

impl From<SqlxError> for RelayStoreError {
    fn from(error: SqlxError) -> Self {
        Self::Database(error)
    }
}

#[derive(Debug, Clone)]
pub struct PostgresRelay {
    database: Database,
}

impl PostgresRelay {
    pub const fn new(database: Database) -> Self {
        Self { database }
    }

    pub async fn push(
        &self,
        dataset_id: Uuid,
        operation: &TransportOp,
    ) -> Result<u64, RelayStoreError> {
        validate_envelope(operation)?;
        let mut transaction = self.database.pool().begin().await?;
        let dataset = query::<Postgres>(
            "SELECT current_epoch, last_sequence, rotation_pending \
             FROM sync_datasets WHERE dataset_id = $1 FOR UPDATE",
        )
        .bind(dataset_id)
        .fetch_optional(&mut *transaction)
        .await?
        .ok_or(RelayStoreError::DatasetNotFound)?;

        let current_epoch = u64::try_from(dataset.get::<i64, _>("current_epoch"))
            .map_err(|_| RelayStoreError::SequenceExhausted)?;
        if operation.key_epoch != current_epoch {
            return Err(RelayError::StaleEpoch {
                current: current_epoch,
                received: operation.key_epoch,
            }
            .into());
        }
        if dataset.get::<bool, _>("rotation_pending") {
            return Err(RelayStoreError::RotationPending);
        }

        let existing = query::<Postgres>(
            "SELECT server_sequence, key_epoch, envelope \
             FROM encrypted_operations WHERE dataset_id = $1 AND operation_id = $2",
        )
        .bind(dataset_id)
        .bind(operation.op_id)
        .fetch_optional(&mut *transaction)
        .await?;
        if let Some(existing) = existing {
            let envelope = existing.get::<Option<Vec<u8>>, _>("envelope");
            let existing_epoch = u64::try_from(existing.get::<i64, _>("key_epoch"))
                .map_err(|_| RelayStoreError::SequenceExhausted)?;
            return match envelope {
                None => Err(RelayError::RedactedOperation.into()),
                Some(envelope)
                    if existing_epoch == operation.key_epoch && envelope == operation.envelope =>
                {
                    u64::try_from(existing.get::<i64, _>("server_sequence"))
                        .map_err(|_| RelayStoreError::SequenceExhausted)
                }
                Some(_) => Err(RelayError::OperationIdConflict.into()),
            };
        }

        let last_sequence = dataset.get::<i64, _>("last_sequence");
        let sequence = last_sequence
            .checked_add(1)
            .ok_or(RelayStoreError::SequenceExhausted)?;
        let key_epoch =
            i64::try_from(operation.key_epoch).map_err(|_| RelayStoreError::SequenceExhausted)?;
        query::<Postgres>(
            "INSERT INTO encrypted_operations \
             (dataset_id, server_sequence, operation_id, key_epoch, envelope) \
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(dataset_id)
        .bind(sequence)
        .bind(operation.op_id)
        .bind(key_epoch)
        .bind(&operation.envelope)
        .execute(&mut *transaction)
        .await?;
        query::<Postgres>("UPDATE sync_datasets SET last_sequence = $2 WHERE dataset_id = $1")
            .bind(dataset_id)
            .bind(sequence)
            .execute(&mut *transaction)
            .await?;
        transaction.commit().await?;
        u64::try_from(sequence).map_err(|_| RelayStoreError::SequenceExhausted)
    }

    pub async fn pull(
        &self,
        dataset_id: Uuid,
        after_cursor: u64,
        limit: u64,
    ) -> Result<TransportPage, RelayStoreError> {
        if limit == 0 {
            return Err(RelayError::InvalidPageLimit.into());
        }
        let limit = limit.min(MAX_PAGE_OPERATIONS);
        let after = i64::try_from(after_cursor).map_err(|_| RelayStoreError::SequenceExhausted)?;
        let row =
            query::<Postgres>("SELECT last_sequence FROM sync_datasets WHERE dataset_id = $1")
                .bind(dataset_id)
                .fetch_optional(self.database.pool())
                .await?
                .ok_or(RelayStoreError::DatasetNotFound)?;
        let last_sequence = u64::try_from(row.get::<i64, _>("last_sequence"))
            .map_err(|_| RelayStoreError::SequenceExhausted)?;
        if after_cursor > last_sequence {
            return Err(RelayError::CursorAhead {
                after_cursor,
                last_sequence,
            }
            .into());
        }

        let window_cursor = after_cursor.saturating_add(limit).min(last_sequence);
        let window =
            i64::try_from(window_cursor).map_err(|_| RelayStoreError::SequenceExhausted)?;
        let rows = query::<Postgres>(
            "SELECT server_sequence, operation_id, key_epoch, envelope \
             FROM encrypted_operations \
             WHERE dataset_id = $1 AND server_sequence > $2 AND server_sequence <= $3 \
             ORDER BY server_sequence",
        )
        .bind(dataset_id)
        .bind(after)
        .bind(window)
        .fetch_all(self.database.pool())
        .await?;

        let mut operations = Vec::with_capacity(rows.len());
        let mut page_bytes = 0_usize;
        let mut next_cursor = window_cursor;
        for row in rows {
            let sequence = u64::try_from(row.get::<i64, _>("server_sequence"))
                .map_err(|_| RelayStoreError::SequenceExhausted)?;
            let Some(envelope) = row.get::<Option<Vec<u8>>, _>("envelope") else {
                continue;
            };
            if page_bytes.saturating_add(envelope.len()) > MAX_PAGE_BYTES {
                next_cursor = sequence.saturating_sub(1);
                break;
            }
            page_bytes += envelope.len();
            let key_epoch = u64::try_from(row.get::<i64, _>("key_epoch"))
                .map_err(|_| RelayStoreError::SequenceExhausted)?;
            operations.push(SequencedTransportOp {
                server_seq: sequence,
                operation: TransportOp {
                    op_id: row.get("operation_id"),
                    key_epoch,
                    envelope,
                },
            });
        }

        Ok(TransportPage {
            after_cursor,
            next_cursor,
            operations,
            more: next_cursor < last_sequence,
        })
    }
}

fn validate_envelope(operation: &TransportOp) -> Result<(), RelayStoreError> {
    if operation.envelope.len() > MAX_ENVELOPE_BYTES {
        return Err(RelayStoreError::InvalidEnvelope);
    }
    let envelope = EncryptedEnvelope::from_bytes(&operation.envelope)
        .map_err(|_| RelayStoreError::InvalidEnvelope)?;
    if envelope.key_epoch != operation.key_epoch {
        return Err(RelayStoreError::InvalidEnvelope);
    }
    Ok(())
}

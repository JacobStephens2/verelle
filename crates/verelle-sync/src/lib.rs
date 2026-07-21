//! Client-side operation-log semantics. The relay is intentionally blind:
//! record keys and mutation contents exist only inside encrypted envelopes.

use serde::{Deserialize, Serialize};
use std::{
    cmp::Ordering,
    collections::{BTreeMap, HashMap},
};
use thiserror::Error;
use uuid::Uuid;
use verelle_core::{DomainError, Observation, RecordKey, VersionStamp};
use verelle_crypto::{CryptoError, EncryptedEnvelope, SecretKey, open, seal};

pub const MAX_PAGE_OPERATIONS: u64 = 100;
pub const MAX_PAGE_ENVELOPE_BYTES: usize = 1024 * 1024;
pub const MAX_ENVELOPE_BYTES: usize = 256 * 1024;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum OperationMutation {
    Upsert { observation: Observation },
    Tombstone,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlainOperation {
    pub op_id: Uuid,
    pub record_key: RecordKey,
    pub version: VersionStamp,
    pub mutation: OperationMutation,
}

impl PlainOperation {
    pub fn upsert(observation: Observation) -> Self {
        Self {
            op_id: Uuid::new_v4(),
            record_key: observation.record_key(),
            version: observation.version.clone(),
            mutation: OperationMutation::Upsert { observation },
        }
    }

    pub fn tombstone(record_key: RecordKey, version: VersionStamp) -> Self {
        Self {
            op_id: Uuid::new_v4(),
            record_key,
            version,
            mutation: OperationMutation::Tombstone,
        }
    }

    pub fn validate(&self) -> Result<(), SyncError> {
        self.version.validate()?;
        if let OperationMutation::Upsert { observation } = &self.mutation {
            observation.validate()?;
            if observation.record_key() != self.record_key {
                return Err(SyncError::RecordKeyMismatch);
            }
            if observation.version != self.version {
                return Err(SyncError::VersionMismatch);
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TransportOp {
    pub op_id: Uuid,
    pub key_epoch: u64,
    pub envelope: Vec<u8>,
}

impl TransportOp {
    pub fn validate(&self) -> Result<(), SyncError> {
        if self.key_epoch == 0 {
            return Err(SyncError::InvalidEpoch);
        }
        if self.envelope.len() > MAX_ENVELOPE_BYTES {
            return Err(SyncError::EnvelopeTooLarge {
                max_bytes: MAX_ENVELOPE_BYTES,
            });
        }
        let envelope = EncryptedEnvelope::from_bytes(&self.envelope)?;
        if envelope.key_epoch != self.key_epoch {
            return Err(SyncError::EnvelopeEpochMismatch);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SequencedTransportOp {
    pub server_seq: u64,
    pub operation: TransportOp,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TransportPage {
    pub after_cursor: u64,
    pub next_cursor: u64,
    pub operations: Vec<SequencedTransportOp>,
    pub more: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MaterializedRecord {
    pub record_key: RecordKey,
    pub winner_op_id: Uuid,
    pub version: VersionStamp,
    /// `None` is a winning tombstone.
    pub observation: Option<Observation>,
}

#[derive(Debug, Error)]
pub enum SyncError {
    #[error("operation contains invalid domain data: {0}")]
    Domain(#[from] DomainError),
    #[error("operation record key does not match its observation")]
    RecordKeyMismatch,
    #[error("operation version does not match its observation")]
    VersionMismatch,
    #[error("operation identifier does not match encrypted transport metadata")]
    OperationIdMismatch,
    #[error("transport key epoch must be greater than zero")]
    InvalidEpoch,
    #[error("encrypted envelope epoch does not match transport metadata")]
    EnvelopeEpochMismatch,
    #[error("encrypted envelope exceeds {max_bytes} bytes")]
    EnvelopeTooLarge { max_bytes: usize },
    #[error("serialization failed: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("cryptographic operation failed: {0}")]
    Crypto(#[from] CryptoError),
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum RelayError {
    #[error("key epoch must be greater than zero")]
    InvalidEpoch,
    #[error("encrypted envelope is malformed or unsupported")]
    InvalidEnvelope,
    #[error("encrypted envelope epoch does not match transport metadata")]
    EnvelopeEpochMismatch,
    #[error("encrypted envelope exceeds {max_bytes} bytes")]
    EnvelopeTooLarge { max_bytes: usize },
    #[error("operation uses stale epoch {received}; current epoch is {current}")]
    StaleEpoch { current: u64, received: u64 },
    #[error("operation ID was reused with different ciphertext")]
    OperationIdConflict,
    #[error("a redacted operation ID cannot be reused")]
    RedactedOperation,
    #[error("pull page limit must be greater than zero")]
    InvalidPageLimit,
    #[error("pull page limit {received} exceeds maximum {maximum}")]
    PageLimitTooLarge { maximum: u64, received: u64 },
    #[error("pull cursor {after_cursor} is ahead of relay sequence {last_sequence}")]
    CursorAhead {
        after_cursor: u64,
        last_sequence: u64,
    },
}

/// In-memory reference model for a single couple's blind relay. It intentionally
/// has no accounts or authentication; production persistence must reproduce
/// these semantics only after the Phase S security gate.
#[derive(Debug, Clone)]
pub struct BlindRelay {
    current_epoch: u64,
    last_sequence: u64,
    rows: BTreeMap<u64, Option<TransportOp>>,
    op_index: HashMap<Uuid, u64>,
}

impl BlindRelay {
    pub fn new(initial_epoch: u64) -> Self {
        Self {
            current_epoch: initial_epoch,
            last_sequence: 0,
            rows: BTreeMap::new(),
            op_index: HashMap::new(),
        }
    }

    pub const fn current_epoch(&self) -> u64 {
        self.current_epoch
    }

    pub const fn barrier_sequence(&self) -> u64 {
        self.last_sequence
    }

    pub fn push(&mut self, operation: TransportOp) -> Result<u64, RelayError> {
        if operation.key_epoch == 0 {
            return Err(RelayError::InvalidEpoch);
        }
        if operation.envelope.len() > MAX_ENVELOPE_BYTES {
            return Err(RelayError::EnvelopeTooLarge {
                max_bytes: MAX_ENVELOPE_BYTES,
            });
        }
        let envelope = EncryptedEnvelope::from_bytes(&operation.envelope)
            .map_err(|_| RelayError::InvalidEnvelope)?;
        if envelope.key_epoch != operation.key_epoch {
            return Err(RelayError::EnvelopeEpochMismatch);
        }
        if operation.key_epoch != self.current_epoch {
            return Err(RelayError::StaleEpoch {
                current: self.current_epoch,
                received: operation.key_epoch,
            });
        }
        if let Some(sequence) = self.op_index.get(&operation.op_id).copied() {
            return match &self.rows[&sequence] {
                Some(existing) if existing == &operation => Ok(sequence),
                Some(_) => Err(RelayError::OperationIdConflict),
                None => Err(RelayError::RedactedOperation),
            };
        }
        self.last_sequence = self.last_sequence.saturating_add(1);
        self.op_index.insert(operation.op_id, self.last_sequence);
        self.rows.insert(self.last_sequence, Some(operation));
        Ok(self.last_sequence)
    }

    pub fn pull(&self, after_cursor: u64, limit: u64) -> Result<TransportPage, RelayError> {
        if limit == 0 {
            return Err(RelayError::InvalidPageLimit);
        }
        if limit > MAX_PAGE_OPERATIONS {
            return Err(RelayError::PageLimitTooLarge {
                maximum: MAX_PAGE_OPERATIONS,
                received: limit,
            });
        }
        if after_cursor > self.last_sequence {
            return Err(RelayError::CursorAhead {
                after_cursor,
                last_sequence: self.last_sequence,
            });
        }
        let page_sequence_end = after_cursor.saturating_add(limit).min(self.last_sequence);
        let mut next_cursor = after_cursor;
        let mut envelope_bytes: usize = 0;
        let mut operations = Vec::new();
        for (server_seq, operation) in self
            .rows
            .range((after_cursor.saturating_add(1))..=page_sequence_end)
        {
            if let Some(operation) = operation {
                let next_bytes = envelope_bytes.saturating_add(operation.envelope.len());
                if next_bytes > MAX_PAGE_ENVELOPE_BYTES {
                    break;
                }
                envelope_bytes = next_bytes;
                operations.push(SequencedTransportOp {
                    server_seq: *server_seq,
                    operation: operation.clone(),
                });
            }
            next_cursor = *server_seq;
        }
        Ok(TransportPage {
            after_cursor,
            next_cursor,
            operations,
            more: next_cursor < self.last_sequence,
        })
    }

    /// Redact ciphertext while preserving its allocated sequence and operation
    /// ID, preventing both cursor ambiguity and later ID resurrection.
    pub fn redact(&mut self, op_ids: &[Uuid]) {
        for op_id in op_ids {
            if let Some(sequence) = self.op_index.get(op_id) {
                self.rows.insert(*sequence, None);
            }
        }
    }

    pub fn advance_epoch(&mut self) -> u64 {
        self.current_epoch = self.current_epoch.saturating_add(1);
        self.current_epoch
    }
}

pub fn encrypt_operation(
    key: &SecretKey,
    key_epoch: u64,
    couple_id: Uuid,
    operation: &PlainOperation,
) -> Result<TransportOp, SyncError> {
    if key_epoch == 0 {
        return Err(SyncError::InvalidEpoch);
    }
    operation.validate()?;
    let plaintext = serde_json::to_vec(operation)?;
    let context = operation_context(couple_id, operation.op_id);
    let envelope = seal(key, key_epoch, &context, &plaintext)?;
    let transport = TransportOp {
        op_id: operation.op_id,
        key_epoch,
        envelope: envelope.to_bytes(),
    };
    transport.validate()?;
    Ok(transport)
}

pub fn decrypt_operation(
    key: &SecretKey,
    couple_id: Uuid,
    transport: &TransportOp,
) -> Result<PlainOperation, SyncError> {
    transport.validate()?;
    let envelope = EncryptedEnvelope::from_bytes(&transport.envelope)?;
    let context = operation_context(couple_id, transport.op_id);
    let plaintext = open(key, transport.key_epoch, &context, &envelope)?;
    let operation: PlainOperation = serde_json::from_slice(&plaintext)?;
    if operation.op_id != transport.op_id {
        return Err(SyncError::OperationIdMismatch);
    }
    operation.validate()?;
    Ok(operation)
}

fn operation_context(couple_id: Uuid, op_id: Uuid) -> Vec<u8> {
    format!("verelle/op/v1/{couple_id}/{op_id}").into_bytes()
}

/// Materialize a complete decrypted operation set. Arrival order has no
/// effect. HLC is compared first, device ID is part of the stamp and is the
/// documented tiebreak, and op ID is a final defensive total-order fallback.
pub fn merge_operations<I>(
    operations: I,
) -> Result<BTreeMap<RecordKey, MaterializedRecord>, SyncError>
where
    I: IntoIterator<Item = PlainOperation>,
{
    let mut records = BTreeMap::new();
    for operation in operations {
        operation.validate()?;
        let replace = records
            .get(&operation.record_key)
            .is_none_or(|current: &MaterializedRecord| compare_winner(&operation, current).is_gt());
        if replace {
            let observation = match operation.mutation {
                OperationMutation::Upsert { observation } => Some(observation),
                OperationMutation::Tombstone => None,
            };
            records.insert(
                operation.record_key.clone(),
                MaterializedRecord {
                    record_key: operation.record_key,
                    winner_op_id: operation.op_id,
                    version: operation.version,
                    observation,
                },
            );
        }
    }
    Ok(records)
}

fn compare_winner(candidate: &PlainOperation, current: &MaterializedRecord) -> Ordering {
    candidate
        .version
        .cmp(&current.version)
        .then_with(|| candidate.op_id.cmp(&current.winner_op_id))
}

/// A caller-driven hybrid logical clock. Supplying wall time makes process
/// death and clock-skew behavior testable without a hidden clock dependency.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HybridClock {
    device_id: String,
    physical_ms: i64,
    logical: u32,
}

impl HybridClock {
    pub fn new(device_id: impl Into<String>, persisted: Option<&VersionStamp>) -> Self {
        let device_id = device_id.into();
        let (physical_ms, logical) =
            persisted.map_or((0, 0), |stamp| (stamp.physical_ms, stamp.logical));
        Self {
            device_id,
            physical_ms,
            logical,
        }
    }

    pub fn tick(&mut self, now_ms: i64) -> VersionStamp {
        if now_ms > self.physical_ms {
            self.physical_ms = now_ms;
            self.logical = 0;
        } else {
            self.logical = self.logical.saturating_add(1);
        }
        self.current()
    }

    pub fn observe(&mut self, remote: &VersionStamp, now_ms: i64) -> VersionStamp {
        let next_physical = self.physical_ms.max(remote.physical_ms).max(now_ms);
        self.logical = if next_physical == self.physical_ms && next_physical == remote.physical_ms {
            self.logical.max(remote.logical).saturating_add(1)
        } else if next_physical == self.physical_ms {
            self.logical.saturating_add(1)
        } else if next_physical == remote.physical_ms {
            remote.logical.saturating_add(1)
        } else {
            0
        };
        self.physical_ms = next_physical;
        self.current()
    }

    pub fn current(&self) -> VersionStamp {
        VersionStamp::new(self.physical_ms, self.logical, self.device_id.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;
    use proptest::prelude::*;
    use verelle_core::{BleedingIntensity, ObservationValue};

    fn upsert(device: &str, physical: i64, logical: u32) -> PlainOperation {
        let version = VersionStamp::new(physical, logical, device);
        PlainOperation::upsert(Observation {
            id: Uuid::new_v4(),
            date: NaiveDate::from_ymd_opt(2026, 7, 18).unwrap(),
            value: ObservationValue::Bleeding {
                intensity: BleedingIntensity::Light,
            },
            recorded_by: device.to_owned(),
            version,
        })
    }

    #[test]
    fn encrypted_transport_hides_and_round_trips_record_key() {
        let key = SecretKey::random();
        let couple = Uuid::new_v4();
        let operation = upsert("a", 100, 0);
        let transport = encrypt_operation(&key, 3, couple, &operation).unwrap();
        let wire = serde_json::to_string(&transport).unwrap();
        assert!(!wire.contains("bleeding"));
        assert!(!wire.contains("2026-07-18"));
        assert_eq!(
            decrypt_operation(&key, couple, &transport).unwrap(),
            operation
        );
    }

    #[test]
    fn edit_delete_race_uses_same_total_order() {
        let edit = upsert("a", 100, 0);
        let delete =
            PlainOperation::tombstone(edit.record_key.clone(), VersionStamp::new(100, 0, "b"));
        let merged = merge_operations([delete.clone(), edit.clone()]).unwrap();
        assert!(merged[&edit.record_key].observation.is_none());
        let reverse = merge_operations([edit.clone(), delete]).unwrap();
        assert_eq!(merged, reverse);
    }

    proptest! {
        #[test]
        fn any_arrival_order_converges(permutation in 0_u8..6) {
            let first = upsert("a", 99, 5);
            let second = upsert("b", 100, 0);
            let third = PlainOperation::tombstone(second.record_key.clone(), VersionStamp::new(100, 0, "c"));
            let ops = [first, second, third];
            let order = match permutation {
                0 => [0, 1, 2],
                1 => [0, 2, 1],
                2 => [1, 0, 2],
                3 => [1, 2, 0],
                4 => [2, 0, 1],
                _ => [2, 1, 0],
            };
            let shuffled = order.map(|index| ops[index].clone());
            let expected = merge_operations(ops.clone()).unwrap();
            let actual = merge_operations(shuffled).unwrap();
            prop_assert_eq!(actual, expected);
        }
    }

    #[test]
    fn clock_never_moves_back_under_wall_clock_skew() {
        let mut clock = HybridClock::new("a", None);
        assert_eq!(clock.tick(100), VersionStamp::new(100, 0, "a"));
        assert_eq!(clock.tick(90), VersionStamp::new(100, 1, "a"));
        let observed = clock.observe(&VersionStamp::new(110, 4, "b"), 80);
        assert_eq!(observed, VersionStamp::new(110, 5, "a"));
    }

    #[test]
    fn blind_relay_is_idempotent_and_clients_converge() {
        let key = SecretKey::random();
        let couple = Uuid::new_v4();
        let first = upsert("a", 99, 4);
        let second = upsert("b", 100, 0);
        let delete =
            PlainOperation::tombstone(second.record_key.clone(), VersionStamp::new(100, 0, "c"));
        let plaintext = [first, second, delete];
        let transport: Vec<_> = plaintext
            .iter()
            .map(|operation| encrypt_operation(&key, 1, couple, operation).unwrap())
            .collect();

        let mut relay = BlindRelay::new(1);
        for operation in &transport {
            relay.push(operation.clone()).unwrap();
        }
        assert_eq!(relay.push(transport[1].clone()).unwrap(), 2);

        let page = relay.pull(0, 100).unwrap();
        assert_eq!(page.next_cursor, 3);
        let received: Vec<_> = page
            .operations
            .iter()
            .map(|item| decrypt_operation(&key, couple, &item.operation).unwrap())
            .collect();
        let mut reverse = received.clone();
        reverse.reverse();
        assert_eq!(
            merge_operations(received).unwrap(),
            merge_operations(reverse).unwrap()
        );
    }

    #[test]
    fn relay_epoch_and_redaction_rules_fail_closed() {
        let old_key = SecretKey::random();
        let new_key = SecretKey::random();
        let couple = Uuid::new_v4();
        let accepted = upsert("a", 1, 0);
        let pending = upsert("b", 2, 0);
        let accepted_old = encrypt_operation(&old_key, 1, couple, &accepted).unwrap();
        let pending_old = encrypt_operation(&old_key, 1, couple, &pending).unwrap();
        let mut relay = BlindRelay::new(1);
        relay.push(accepted_old.clone()).unwrap();
        relay.advance_epoch();
        assert_eq!(
            relay.push(pending_old),
            Err(RelayError::StaleEpoch {
                current: 2,
                received: 1
            })
        );
        let pending_new = encrypt_operation(&new_key, 2, couple, &pending).unwrap();
        assert_eq!(relay.push(pending_new).unwrap(), 2);

        relay.redact(&[accepted.op_id]);
        let first_page = relay.pull(0, 1).unwrap();
        assert!(first_page.operations.is_empty());
        assert_eq!(first_page.next_cursor, 1);
        assert!(first_page.more);
        let second_page = relay.pull(1, 1).unwrap();
        assert_eq!(second_page.operations.len(), 1);
        assert_eq!(second_page.next_cursor, 2);
        let accepted_new = encrypt_operation(&new_key, 2, couple, &accepted).unwrap();
        assert_eq!(relay.push(accepted_new), Err(RelayError::RedactedOperation));
    }

    #[test]
    fn relay_rejects_malformed_epoch_inconsistent_and_oversized_envelopes() {
        let mut relay = BlindRelay::new(1);
        let malformed = TransportOp {
            op_id: Uuid::new_v4(),
            key_epoch: 1,
            envelope: vec![0; 64],
        };
        assert_eq!(relay.push(malformed), Err(RelayError::InvalidEnvelope));

        let key = SecretKey::random();
        let couple = Uuid::new_v4();
        let operation = upsert("a", 1, 0);
        let mut inconsistent = encrypt_operation(&key, 2, couple, &operation).unwrap();
        inconsistent.key_epoch = 1;
        assert_eq!(
            relay.push(inconsistent),
            Err(RelayError::EnvelopeEpochMismatch)
        );

        let oversized = TransportOp {
            op_id: Uuid::new_v4(),
            key_epoch: 1,
            envelope: vec![0; MAX_ENVELOPE_BYTES + 1],
        };
        assert_eq!(
            relay.push(oversized),
            Err(RelayError::EnvelopeTooLarge {
                max_bytes: MAX_ENVELOPE_BYTES
            })
        );
    }

    #[test]
    fn relay_enforces_page_limits() {
        let relay = BlindRelay::new(1);
        assert_eq!(relay.pull(0, 0), Err(RelayError::InvalidPageLimit));
        assert_eq!(
            relay.pull(0, MAX_PAGE_OPERATIONS + 1),
            Err(RelayError::PageLimitTooLarge {
                maximum: MAX_PAGE_OPERATIONS,
                received: MAX_PAGE_OPERATIONS + 1
            })
        );
    }

    #[test]
    fn relay_pages_stop_before_the_ciphertext_byte_limit() {
        let key = SecretKey::random();
        let couple = Uuid::new_v4();
        let mut relay = BlindRelay::new(1);
        for physical in 1..=5 {
            let mut operation = upsert("a", physical, 0);
            let OperationMutation::Upsert { observation } = &mut operation.mutation else {
                unreachable!();
            };
            observation.value = ObservationValue::Note {
                text: "x".repeat(240 * 1024),
            };
            operation.record_key = observation.record_key();
            relay
                .push(encrypt_operation(&key, 1, couple, &operation).unwrap())
                .unwrap();
        }

        let first = relay.pull(0, 5).unwrap();
        assert_eq!(first.operations.len(), 4);
        assert_eq!(first.next_cursor, 4);
        assert!(first.more);
        assert!(
            first
                .operations
                .iter()
                .map(|item| item.operation.envelope.len())
                .sum::<usize>()
                <= MAX_PAGE_ENVELOPE_BYTES
        );

        let second = relay.pull(first.next_cursor, 5).unwrap();
        assert_eq!(second.operations.len(), 1);
        assert_eq!(second.next_cursor, 5);
        assert!(!second.more);
    }

    #[test]
    fn client_rejects_zero_epoch_and_oversized_operations_before_queueing() {
        let key = SecretKey::random();
        let couple = Uuid::new_v4();
        let operation = upsert("a", 1, 0);
        assert!(matches!(
            encrypt_operation(&key, 0, couple, &operation),
            Err(SyncError::InvalidEpoch)
        ));

        let mut oversized = operation;
        let OperationMutation::Upsert { observation } = &mut oversized.mutation else {
            unreachable!();
        };
        observation.value = ObservationValue::Note {
            text: "x".repeat(MAX_ENVELOPE_BYTES),
        };
        oversized.record_key = observation.record_key();
        assert!(matches!(
            encrypt_operation(&key, 1, couple, &oversized),
            Err(SyncError::EnvelopeTooLarge {
                max_bytes: MAX_ENVELOPE_BYTES
            })
        ));
    }
}

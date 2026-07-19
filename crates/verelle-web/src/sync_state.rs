use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use thiserror::Error;
use uuid::Uuid;
use verelle_api::{PullResponse, PushRequest, TransportOperation};
use verelle_core::Observation;
use verelle_crypto::SecretKey;
use verelle_sync::{
    PlainOperation, SyncError, TransportOp, decrypt_operation, encrypt_operation, merge_operations,
};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct BrowserSyncState {
    pub operations: Vec<PlainOperation>,
    pub outbox: Vec<TransportOp>,
    pub cursor: u64,
}

impl BrowserSyncState {
    pub fn append_observation(
        &mut self,
        dataset_key: &SecretKey,
        dataset_id: Uuid,
        key_epoch: u64,
        observation: Observation,
    ) -> Result<Uuid, BrowserSyncError> {
        let operation = PlainOperation::upsert(observation);
        let transport = encrypt_operation(dataset_key, key_epoch, dataset_id, &operation)?;
        let op_id = operation.op_id;
        self.operations.push(operation);
        self.outbox.push(transport);
        Ok(op_id)
    }

    pub fn push_request(&self) -> Option<PushRequest> {
        (!self.outbox.is_empty()).then(|| PushRequest {
            operations: self
                .outbox
                .iter()
                .take(verelle_api::MAX_PUSH_OPERATIONS)
                .map(TransportOperation::from_transport)
                .collect(),
        })
    }

    pub fn acknowledge(&mut self, operation_ids: &[Uuid]) {
        self.outbox
            .retain(|operation| !operation_ids.contains(&operation.op_id));
    }

    pub fn apply_pull(
        &mut self,
        dataset_key: &SecretKey,
        dataset_id: Uuid,
        page: PullResponse,
    ) -> Result<(), BrowserSyncError> {
        if page.after_cursor != self.cursor {
            return Err(BrowserSyncError::CursorMismatch);
        }
        if page.next_cursor < page.after_cursor {
            return Err(BrowserSyncError::CursorRewind);
        }
        let page = page.into_transport_page()?;
        let existing = self
            .operations
            .iter()
            .cloned()
            .map(|operation| (operation.op_id, operation))
            .collect::<HashMap<_, _>>();
        let echoed = page
            .operations
            .iter()
            .map(|sequenced| sequenced.operation.op_id)
            .collect::<Vec<_>>();
        let mut incoming = Vec::with_capacity(page.operations.len());
        for sequenced in page.operations {
            if sequenced.server_seq <= page.after_cursor || sequenced.server_seq > page.next_cursor
            {
                return Err(BrowserSyncError::InvalidServerSequence);
            }
            let operation = decrypt_operation(dataset_key, dataset_id, &sequenced.operation)?;
            if existing
                .get(&operation.op_id)
                .is_some_and(|current| current != &operation)
            {
                return Err(BrowserSyncError::OperationConflict);
            }
            incoming.push(operation);
        }
        for operation in incoming {
            if !existing.contains_key(&operation.op_id) {
                self.operations.push(operation);
            }
        }
        self.acknowledge(&echoed);
        self.cursor = page.next_cursor;
        Ok(())
    }

    pub fn materialized_observations(&self) -> Result<Vec<Observation>, BrowserSyncError> {
        Ok(merge_operations(self.operations.clone())?
            .into_values()
            .filter_map(|record| record.observation)
            .collect())
    }
}

#[derive(Debug, Error)]
pub enum BrowserSyncError {
    #[error("synchronization crypto or validation failed")]
    Sync(#[from] SyncError),
    #[error("wire response is invalid")]
    Wire(#[from] verelle_api::WireError),
    #[error("pull cursor does not match durable browser state")]
    CursorMismatch,
    #[error("pull cursor moved backward")]
    CursorRewind,
    #[error("server sequence is outside the page watermark")]
    InvalidServerSequence,
    #[error("operation ID was reused with different plaintext")]
    OperationConflict,
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;
    use verelle_core::{CycleStartBasis, ObservationValue, VersionStamp};
    use verelle_sync::{SequencedTransportOp, TransportPage};

    fn observation(device: &str, physical: i64) -> Observation {
        Observation {
            id: Uuid::new_v4(),
            date: NaiveDate::from_ymd_opt(2026, 7, 19).unwrap(),
            value: ObservationValue::CycleStart {
                cycle_id: Uuid::new_v4(),
                basis: CycleStartBasis::Menses,
                method_cycle_number: Some(1),
                postpartum_cycle_number: None,
            },
            recorded_by: device.to_owned(),
            version: VersionStamp::new(physical, 0, device),
        }
    }

    #[test]
    fn encrypted_push_pull_echo_converges_and_clears_outbox() {
        let key = SecretKey::from_bytes([31_u8; 32]);
        let dataset_id = Uuid::new_v4();
        let mut first = BrowserSyncState::default();
        first
            .append_observation(&key, dataset_id, 1, observation("web-a", 1))
            .unwrap();
        let transport = first.outbox[0].clone();
        let page = PullResponse::from(&TransportPage {
            after_cursor: 0,
            next_cursor: 1,
            operations: vec![SequencedTransportOp {
                server_seq: 1,
                operation: transport,
            }],
            more: false,
        });
        first.apply_pull(&key, dataset_id, page.clone()).unwrap();
        assert!(first.outbox.is_empty());

        let mut second = BrowserSyncState::default();
        second.apply_pull(&key, dataset_id, page).unwrap();
        assert_eq!(
            first.materialized_observations().unwrap(),
            second.materialized_observations().unwrap()
        );
    }
}

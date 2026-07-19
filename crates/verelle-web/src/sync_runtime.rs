use crate::{sync_state::BrowserSyncState, sync_transport};
use std::collections::HashSet;
use thiserror::Error;
use uuid::Uuid;
use verelle_crypto::SecretKey;

const MAX_PULL_PAGES_PER_SYNC: usize = 100;

pub struct ReviewedSyncSession {
    pub dataset_id: Uuid,
    pub bearer_token: String,
    pub dataset_key: SecretKey,
    pub key_epoch: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SyncSummary {
    pub pushed: usize,
    pub pulled: usize,
}

pub async fn sync_once(
    state: &mut BrowserSyncState,
    session: &ReviewedSyncSession,
) -> Result<SyncSummary, BrowserSyncRuntimeError> {
    let mut pulled = pull_until_caught_up(state, session).await?;
    let mut pushed = 0;
    if let Some(request) = state.push_request() {
        let queued = request
            .operations
            .iter()
            .map(|operation| operation.operation_id)
            .collect::<HashSet<_>>();
        let response = sync_transport::push(session.dataset_id, &session.bearer_token, &request)
            .await
            .map_err(BrowserSyncRuntimeError::Transport)?;
        let accepted = response
            .accepted
            .into_iter()
            .map(|operation| operation.operation_id)
            .collect::<Vec<_>>();
        if accepted.is_empty()
            || accepted.iter().collect::<HashSet<_>>().len() != accepted.len()
            || accepted
                .iter()
                .any(|operation_id| !queued.contains(operation_id))
        {
            return Err(BrowserSyncRuntimeError::InvalidAcknowledgement);
        }
        pushed = accepted.len();
        state.acknowledge(&accepted);
        pulled += pull_until_caught_up(state, session).await?;
    }
    Ok(SyncSummary { pushed, pulled })
}

async fn pull_until_caught_up(
    state: &mut BrowserSyncState,
    session: &ReviewedSyncSession,
) -> Result<usize, BrowserSyncRuntimeError> {
    let mut pulled = 0;
    for _ in 0..MAX_PULL_PAGES_PER_SYNC {
        let page = sync_transport::pull(session.dataset_id, &session.bearer_token, state.cursor)
            .await
            .map_err(BrowserSyncRuntimeError::Transport)?;
        let more = page.more;
        pulled += page.operations.len();
        state.apply_pull(&session.dataset_key, session.dataset_id, page)?;
        if !more {
            return Ok(pulled);
        }
    }
    Err(BrowserSyncRuntimeError::PageLimit)
}

#[derive(Debug, Error)]
pub enum BrowserSyncRuntimeError {
    #[error("the sync transport failed: {0}")]
    Transport(String),
    #[error("the server returned an invalid push acknowledgement")]
    InvalidAcknowledgement,
    #[error("the sync response exceeded the page limit")]
    PageLimit,
    #[error(transparent)]
    State(#[from] crate::sync_state::BrowserSyncError),
}

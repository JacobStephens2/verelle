//! Typed native boundary for platform shells.
//!
//! The boundary owns local persistence, HLC advancement, encrypted outbox
//! creation, and chart rebuilding. Platform code supplies a data key unwrapped
//! from its secure storage. No exported type represents protocol interpretation
//! or computed fertility status.

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::NaiveDate;
use sha2::{Digest, Sha256};
use std::{
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use thiserror::Error;
use uuid::Uuid;
use verelle_api::{login_device_proof_message, registration_device_proof_message};
use verelle_auth::{
    AuthProtocolError, account_credential_identifier, client_login_finish, client_login_start,
    client_registration_finish, client_registration_start, derive_account_wrapping_key,
};
use verelle_core::{
    CycleChart, CycleStartBasis, GoldenFixture, MarkerType, MonitorReading, Observation,
    ObservationValue, build_charts,
};
use verelle_crypto::{RecoveryCode, SecretKey, recovery_public_key, wrap_secret_key};
use verelle_store::{RemoteOperation, RemotePage, Store};
use verelle_sync::{
    HybridClock, PlainOperation, TransportOp, decrypt_operation, encrypt_operation,
};

uniffi::setup_scaffolding!();

const LOCAL_KEY_EPOCH: u64 = 1;
const LOCAL_DATASET_ID_SETTING: &str = "local_dataset_id";
const LOCAL_KEY_FINGERPRINT_SETTING: &str = "local_key_fingerprint";

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct FfiChartEntry {
    pub marker: String,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct FfiChartDay {
    pub date: String,
    pub cycle_day: u32,
    pub markers: Vec<String>,
    pub entries: Vec<FfiChartEntry>,
    pub annotations: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct FfiChart {
    pub start_date: String,
    pub basis: String,
    pub method_cycle_number: u32,
    pub postpartum_cycle_number: Option<u32>,
    pub days: Vec<FfiChartDay>,
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct FfiTransportOperation {
    pub operation_id: String,
    pub key_epoch: u64,
    pub envelope_base64url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct FfiSyncBatch {
    pub dataset_id: String,
    pub after_cursor: u64,
    pub operations: Vec<FfiTransportOperation>,
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct FfiSequencedTransportOperation {
    pub server_sequence: u64,
    pub operation: FfiTransportOperation,
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct FfiPullPage {
    pub after_cursor: u64,
    pub next_cursor: u64,
    pub operations: Vec<FfiSequencedTransportOperation>,
    pub more: bool,
}

/// Opaque client state is returned to Kotlin only for the duration of one
/// registration HTTP exchange. It must never be persisted.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct FfiOpaqueRegistrationStart {
    pub state: Vec<u8>,
    pub request: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct FfiAccountRegistrationMaterial {
    pub registration_upload: Vec<u8>,
    pub server_public_key: Vec<u8>,
    pub wrapped_account_key: Vec<u8>,
    pub recovery_wrapped_account_key: Vec<u8>,
    pub recovery_public_key: Vec<u8>,
    pub wrapped_dataset_key: Vec<u8>,
    pub recovery_code: String,
}

/// Opaque client state is returned to Kotlin only for the duration of one
/// login HTTP exchange. It must never be persisted.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct FfiOpaqueLoginStart {
    pub state: Vec<u8>,
    pub request: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct FfiOpaqueLoginFinish {
    pub credential_finalization: Vec<u8>,
}

#[derive(Debug, Error, uniffi::Error)]
pub enum FixtureReplayError {
    #[error("fixture JSON is invalid")]
    InvalidJson,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum FfiMonitorReading {
    Low,
    High,
    Peak,
    Missed,
    Error,
}

#[derive(Debug, Error, uniffi::Error)]
pub enum LocalRepositoryError {
    #[error("the local data key must contain exactly 32 bytes")]
    InvalidKey,
    #[error("the local data key does not match this database")]
    KeyMismatch,
    #[error("the recording date must use YYYY-MM-DD")]
    InvalidDate,
    #[error("the device identifier is invalid")]
    InvalidDevice,
    #[error("the database path is invalid")]
    InvalidDatabasePath,
    #[error("the method-cycle number must be greater than zero")]
    InvalidMethodCycleNumber,
    #[error("local storage failed")]
    Storage,
    #[error("local encryption failed")]
    Encryption,
    #[error("the local repository lock is unavailable")]
    LockUnavailable,
    #[error("the system clock is unavailable")]
    Clock,
    #[error("the sync batch limit must be greater than zero")]
    InvalidSyncLimit,
    #[error("a sync operation identifier is invalid")]
    InvalidOperationId,
    #[error("a sync envelope is invalid")]
    InvalidEnvelope,
    #[error("the pull page failed authentication or validation")]
    InvalidPullPage,
    #[error("the account identifier is invalid")]
    InvalidAccountIdentifier,
    #[error("the account authentication exchange is invalid")]
    InvalidAuthenticationExchange,
    #[error("account key protection failed")]
    AccountKeyProtection,
}

#[derive(Debug, Error, uniffi::Error)]
pub enum AccountAuthError {
    #[error("the account identifier is invalid")]
    InvalidAccountIdentifier,
    #[error("the OPAQUE authentication exchange is invalid")]
    InvalidAuthenticationExchange,
    #[error("the pinned server key did not match")]
    ServerKeyChanged,
    #[error("an enrollment identifier is invalid")]
    InvalidEnrollmentIdentifier,
}

#[derive(uniffi::Object)]
pub struct LocalRepository {
    inner: Mutex<RepositoryInner>,
}

struct RepositoryInner {
    store: Store,
    data_key: SecretKey,
    dataset_id: Uuid,
    device_id: String,
    clock: HybridClock,
}

impl From<CycleChart> for FfiChart {
    fn from(chart: CycleChart) -> Self {
        Self {
            start_date: chart.start_date.to_string(),
            basis: cycle_basis_label(chart.basis).to_owned(),
            method_cycle_number: chart.method_cycle_number,
            postpartum_cycle_number: chart.postpartum_cycle_number,
            days: chart
                .days
                .into_iter()
                .map(|day| FfiChartDay {
                    date: day.date.to_string(),
                    cycle_day: day.cycle_day,
                    markers: day
                        .observations
                        .iter()
                        .map(|observation| observation.value.marker_type().to_string())
                        .collect(),
                    entries: day
                        .observations
                        .into_iter()
                        .map(|observation| FfiChartEntry {
                            marker: observation.value.marker_type().to_string(),
                            label: observation_label(&observation.value),
                        })
                        .collect(),
                    annotations: day
                        .annotations
                        .iter()
                        .map(verelle_core::MechanicalAnnotation::label)
                        .collect(),
                })
                .collect(),
        }
    }
}

#[uniffi::export]
impl LocalRepository {
    #[uniffi::constructor]
    #[allow(clippy::needless_pass_by_value)] // UniFFI owns lifted values.
    pub fn open(
        database_path: String,
        mut key_material: Vec<u8>,
        device_id: String,
    ) -> Result<Arc<Self>, LocalRepositoryError> {
        if database_path.trim().is_empty() {
            key_material.fill(0);
            return Err(LocalRepositoryError::InvalidDatabasePath);
        }
        if device_id.trim().is_empty() {
            key_material.fill(0);
            return Err(LocalRepositoryError::InvalidDevice);
        }
        if key_material.len() != 32 {
            key_material.fill(0);
            return Err(LocalRepositoryError::InvalidKey);
        }

        let fingerprint = Sha256::digest(&key_material).to_vec();
        let mut key_bytes = [0_u8; 32];
        key_bytes.copy_from_slice(&key_material);
        key_material.fill(0);

        let store = Store::open(database_path).map_err(|_| LocalRepositoryError::Storage)?;
        let existing_fingerprint: Option<Vec<u8>> = store
            .setting(LOCAL_KEY_FINGERPRINT_SETTING)
            .map_err(|_| LocalRepositoryError::Storage)?;
        if existing_fingerprint
            .as_ref()
            .is_some_and(|existing| existing != &fingerprint)
        {
            return Err(LocalRepositoryError::KeyMismatch);
        }
        if existing_fingerprint.is_none() {
            store
                .set_setting(LOCAL_KEY_FINGERPRINT_SETTING, &fingerprint)
                .map_err(|_| LocalRepositoryError::Storage)?;
        }

        let dataset_id = if let Some(dataset_id) = store
            .setting(LOCAL_DATASET_ID_SETTING)
            .map_err(|_| LocalRepositoryError::Storage)?
        {
            dataset_id
        } else {
            let dataset_id = Uuid::new_v4();
            store
                .set_setting(LOCAL_DATASET_ID_SETTING, &dataset_id)
                .map_err(|_| LocalRepositoryError::Storage)?;
            dataset_id
        };
        let persisted_clock = store
            .max_version_seen()
            .map_err(|_| LocalRepositoryError::Storage)?;
        let clock = HybridClock::new(device_id.clone(), persisted_clock.as_ref());

        Ok(Arc::new(Self {
            inner: Mutex::new(RepositoryInner {
                store,
                data_key: SecretKey::from_bytes(key_bytes),
                dataset_id,
                device_id,
                clock,
            }),
        }))
    }

    #[allow(clippy::needless_pass_by_value)] // UniFFI owns lifted String arguments.
    pub fn record_cycle_start(
        &self,
        date: String,
        method_cycle_number: u32,
    ) -> Result<(), LocalRepositoryError> {
        if method_cycle_number == 0 {
            return Err(LocalRepositoryError::InvalidMethodCycleNumber);
        }
        let date = parse_date(&date)?;
        self.lock()?.append(
            date,
            ObservationValue::CycleStart {
                cycle_id: Uuid::new_v4(),
                basis: CycleStartBasis::Menses,
                method_cycle_number: Some(method_cycle_number),
                postpartum_cycle_number: None,
            },
        )
    }

    #[allow(clippy::needless_pass_by_value)] // UniFFI owns lifted String arguments.
    pub fn record_monitor_reading(
        &self,
        date: String,
        reading: FfiMonitorReading,
    ) -> Result<(), LocalRepositoryError> {
        let date = parse_date(&date)?;
        self.lock()?.append(
            date,
            ObservationValue::Monitor {
                reading: reading.into(),
                test_requested: true,
                test_time: None,
                first_morning_urine: None,
                error_code: None,
            },
        )
    }

    pub fn charts(&self) -> Result<Vec<FfiChart>, LocalRepositoryError> {
        let inner = self.lock()?;
        let observations = inner
            .store
            .materialized_observations()
            .map_err(|_| LocalRepositoryError::Storage)?;
        Ok(build_charts(&observations)
            .into_iter()
            .map(FfiChart::from)
            .collect())
    }

    pub fn dataset_id(&self) -> Result<String, LocalRepositoryError> {
        Ok(self.lock()?.dataset_id.to_string())
    }

    /// Completes OPAQUE registration and creates the account/recovery wraps
    /// around this repository's existing dataset key. Plain account and
    /// dataset keys never cross the `UniFFI` boundary.
    #[allow(clippy::needless_pass_by_value)] // UniFFI owns lifted byte buffers.
    pub fn finish_account_registration(
        &self,
        mut state: Vec<u8>,
        mut password: Vec<u8>,
        account_identifier: String,
        registration_response: Vec<u8>,
    ) -> Result<FfiAccountRegistrationMaterial, LocalRepositoryError> {
        let Ok(credential_identifier) = account_credential_identifier(&account_identifier) else {
            state.fill(0);
            password.fill(0);
            return Err(LocalRepositoryError::InvalidAccountIdentifier);
        };
        let finished = client_registration_finish(
            &state,
            &password,
            &credential_identifier,
            &registration_response,
        )
        .map_err(|_| LocalRepositoryError::InvalidAuthenticationExchange);
        state.fill(0);
        password.fill(0);
        let finished = finished?;
        let password_wrapping_key = SecretKey::from_bytes(
            derive_account_wrapping_key(finished.export_key)
                .map_err(|_| LocalRepositoryError::AccountKeyProtection)?,
        );
        let account_data_key = SecretKey::random();
        let recovery_code = RecoveryCode::generate();
        let wrapped_account_key = wrap_secret_key(
            &password_wrapping_key,
            LOCAL_KEY_EPOCH,
            b"account/password-wrap",
            &account_data_key,
        )
        .map_err(|_| LocalRepositoryError::AccountKeyProtection)?;
        let wrapped_recovery_key = wrap_secret_key(
            &recovery_code
                .wrapping_key()
                .map_err(|_| LocalRepositoryError::AccountKeyProtection)?,
            LOCAL_KEY_EPOCH,
            b"account/recovery-wrap",
            &account_data_key,
        )
        .map_err(|_| LocalRepositoryError::AccountKeyProtection)?;
        let inner = self.lock()?;
        let wrapped_dataset_key = wrap_secret_key(
            &account_data_key,
            LOCAL_KEY_EPOCH,
            b"dataset/account-wrap",
            &inner.data_key,
        )
        .map_err(|_| LocalRepositoryError::AccountKeyProtection)?;
        let recovery_public_key = recovery_public_key(&account_data_key)
            .map_err(|_| LocalRepositoryError::AccountKeyProtection)?;

        Ok(FfiAccountRegistrationMaterial {
            registration_upload: finished.upload,
            server_public_key: finished.server_public_key,
            wrapped_account_key: wrapped_account_key.to_bytes(),
            recovery_wrapped_account_key: wrapped_recovery_key.to_bytes(),
            recovery_public_key,
            wrapped_dataset_key: wrapped_dataset_key.to_bytes(),
            recovery_code: recovery_code.as_str().to_owned(),
        })
    }

    pub fn pending_outbox_count(&self) -> Result<u64, LocalRepositoryError> {
        let count = self
            .lock()?
            .store
            .pending_outbox(100_000)
            .map_err(|_| LocalRepositoryError::Storage)?
            .len();
        u64::try_from(count).map_err(|_| LocalRepositoryError::Storage)
    }

    pub fn sync_batch(&self, max_operations: u32) -> Result<FfiSyncBatch, LocalRepositoryError> {
        if max_operations == 0 {
            return Err(LocalRepositoryError::InvalidSyncLimit);
        }
        let inner = self.lock()?;
        let operations = inner
            .store
            .pending_outbox(max_operations as usize)
            .map_err(|_| LocalRepositoryError::Storage)?
            .into_iter()
            .map(FfiTransportOperation::from)
            .collect();
        let after_cursor = inner
            .store
            .cursor()
            .map_err(|_| LocalRepositoryError::Storage)?;
        Ok(FfiSyncBatch {
            dataset_id: inner.dataset_id.to_string(),
            after_cursor,
            operations,
        })
    }

    #[allow(clippy::needless_pass_by_value)] // UniFFI owns lifted String sequences.
    pub fn acknowledge_pushed(
        &self,
        operation_ids: Vec<String>,
    ) -> Result<(), LocalRepositoryError> {
        let operation_ids = operation_ids
            .into_iter()
            .map(|operation_id| {
                Uuid::parse_str(&operation_id).map_err(|_| LocalRepositoryError::InvalidOperationId)
            })
            .collect::<Result<Vec<_>, _>>()?;
        self.lock()?
            .store
            .acknowledge_pushed(&operation_ids)
            .map_err(|_| LocalRepositoryError::Storage)
    }

    #[allow(clippy::needless_pass_by_value)] // UniFFI owns lifted records.
    pub fn apply_pull_page(&self, page: FfiPullPage) -> Result<(), LocalRepositoryError> {
        let mut inner = self.lock()?;
        let operations = page
            .operations
            .into_iter()
            .map(|sequenced| {
                let transport = TransportOp::try_from(sequenced.operation)?;
                let operation = decrypt_operation(&inner.data_key, inner.dataset_id, &transport)
                    .map_err(|_| LocalRepositoryError::InvalidPullPage)?;
                Ok(RemoteOperation {
                    server_seq: sequenced.server_sequence,
                    operation,
                })
            })
            .collect::<Result<Vec<_>, LocalRepositoryError>>()?;
        inner
            .store
            .apply_remote_page(RemotePage {
                after_cursor: page.after_cursor,
                next_cursor: page.next_cursor,
                operations,
            })
            .map_err(|_| LocalRepositoryError::InvalidPullPage)
    }
}

#[uniffi::export]
#[allow(clippy::needless_pass_by_value)] // UniFFI owns lifted byte buffers.
pub fn opaque_registration_start(
    mut password: Vec<u8>,
) -> Result<FfiOpaqueRegistrationStart, AccountAuthError> {
    let started = client_registration_start(&password)
        .map_err(|_| AccountAuthError::InvalidAuthenticationExchange);
    password.fill(0);
    let started = started?;
    Ok(FfiOpaqueRegistrationStart {
        state: started.state,
        request: started.request,
    })
}

#[uniffi::export]
#[allow(clippy::needless_pass_by_value)] // UniFFI owns lifted byte buffers.
pub fn opaque_login_start(mut password: Vec<u8>) -> Result<FfiOpaqueLoginStart, AccountAuthError> {
    let started =
        client_login_start(&password).map_err(|_| AccountAuthError::InvalidAuthenticationExchange);
    password.fill(0);
    let started = started?;
    Ok(FfiOpaqueLoginStart {
        state: started.state,
        request: started.request,
    })
}

#[uniffi::export]
#[allow(clippy::needless_pass_by_value)] // UniFFI owns lifted values.
pub fn opaque_login_finish(
    mut state: Vec<u8>,
    mut password: Vec<u8>,
    account_identifier: String,
    credential_response: Vec<u8>,
    expected_server_public_key: Vec<u8>,
) -> Result<FfiOpaqueLoginFinish, AccountAuthError> {
    let Ok(credential_identifier) = account_credential_identifier(&account_identifier) else {
        state.fill(0);
        password.fill(0);
        return Err(AccountAuthError::InvalidAccountIdentifier);
    };
    let finished = client_login_finish(
        &state,
        &password,
        &credential_identifier,
        &credential_response,
        &expected_server_public_key,
    );
    state.fill(0);
    password.fill(0);
    let mut finished = finished.map_err(|error| match error {
        AuthProtocolError::ServerKeyChanged => AccountAuthError::ServerKeyChanged,
        _ => AccountAuthError::InvalidAuthenticationExchange,
    })?;
    finished.export_key.fill(0);
    finished.server_public_key.fill(0);
    finished.session_key.fill(0);
    Ok(FfiOpaqueLoginFinish {
        credential_finalization: finished.finalization,
    })
}

#[uniffi::export]
#[allow(clippy::needless_pass_by_value)] // UniFFI owns lifted values.
pub fn account_registration_device_proof(
    flow_id: String,
    device_id: String,
    dataset_id: String,
    registration_upload: Vec<u8>,
) -> Result<Vec<u8>, AccountAuthError> {
    let flow_id = parse_enrollment_id(&flow_id)?;
    let device_id = parse_enrollment_id(&device_id)?;
    let dataset_id = parse_enrollment_id(&dataset_id)?;
    Ok(registration_device_proof_message(
        flow_id,
        device_id,
        dataset_id,
        &registration_upload,
    ))
}

#[uniffi::export]
#[allow(clippy::needless_pass_by_value)] // UniFFI owns lifted values.
pub fn account_login_device_proof(
    flow_id: String,
    device_challenge: Vec<u8>,
) -> Result<Vec<u8>, AccountAuthError> {
    let flow_id = parse_enrollment_id(&flow_id)?;
    if device_challenge.is_empty() {
        return Err(AccountAuthError::InvalidAuthenticationExchange);
    }
    Ok(login_device_proof_message(flow_id, &device_challenge))
}

fn parse_enrollment_id(value: &str) -> Result<Uuid, AccountAuthError> {
    Uuid::parse_str(value)
        .ok()
        .filter(|value| !value.is_nil())
        .ok_or(AccountAuthError::InvalidEnrollmentIdentifier)
}

impl From<TransportOp> for FfiTransportOperation {
    fn from(operation: TransportOp) -> Self {
        Self {
            operation_id: operation.op_id.to_string(),
            key_epoch: operation.key_epoch,
            envelope_base64url: URL_SAFE_NO_PAD.encode(operation.envelope),
        }
    }
}

impl TryFrom<FfiTransportOperation> for TransportOp {
    type Error = LocalRepositoryError;

    fn try_from(operation: FfiTransportOperation) -> Result<Self, Self::Error> {
        let op_id = Uuid::parse_str(&operation.operation_id)
            .map_err(|_| LocalRepositoryError::InvalidOperationId)?;
        let envelope = URL_SAFE_NO_PAD
            .decode(operation.envelope_base64url)
            .map_err(|_| LocalRepositoryError::InvalidEnvelope)?;
        if envelope.is_empty() {
            return Err(LocalRepositoryError::InvalidEnvelope);
        }
        Ok(Self {
            op_id,
            key_epoch: operation.key_epoch,
            envelope,
        })
    }
}

impl LocalRepository {
    fn lock(&self) -> Result<std::sync::MutexGuard<'_, RepositoryInner>, LocalRepositoryError> {
        self.inner
            .lock()
            .map_err(|_| LocalRepositoryError::LockUnavailable)
    }
}

impl RepositoryInner {
    fn append(
        &mut self,
        date: NaiveDate,
        value: ObservationValue,
    ) -> Result<(), LocalRepositoryError> {
        let version = self.clock.tick(now_ms()?);
        let observation = Observation {
            id: Uuid::new_v4(),
            date,
            value,
            recorded_by: self.device_id.clone(),
            version,
        };
        let operation = PlainOperation::upsert(observation);
        let transport =
            encrypt_operation(&self.data_key, LOCAL_KEY_EPOCH, self.dataset_id, &operation)
                .map_err(|_| LocalRepositoryError::Encryption)?;
        self.store
            .append_local(&operation, &transport)
            .map_err(|_| LocalRepositoryError::Storage)?;
        Ok(())
    }
}

impl From<FfiMonitorReading> for MonitorReading {
    fn from(reading: FfiMonitorReading) -> Self {
        match reading {
            FfiMonitorReading::Low => Self::Low,
            FfiMonitorReading::High => Self::High,
            FfiMonitorReading::Peak => Self::Peak,
            FfiMonitorReading::Missed => Self::Missed,
            FfiMonitorReading::Error => Self::Error,
        }
    }
}

fn parse_date(date: &str) -> Result<NaiveDate, LocalRepositoryError> {
    NaiveDate::parse_from_str(date, "%Y-%m-%d").map_err(|_| LocalRepositoryError::InvalidDate)
}

fn now_ms() -> Result<i64, LocalRepositoryError> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| LocalRepositoryError::Clock)?
        .as_millis();
    i64::try_from(millis).map_err(|_| LocalRepositoryError::Clock)
}

const fn cycle_basis_label(basis: CycleStartBasis) -> &'static str {
    match basis {
        CycleStartBasis::Menses => "menses",
        CycleStartBasis::ArtificialPostpartum => "artificial_postpartum",
        CycleStartBasis::ReturnToCycles => "return_to_cycles",
    }
}

fn observation_label(value: &ObservationValue) -> String {
    match value {
        ObservationValue::CycleStart { .. } => "Cycle start".to_owned(),
        ObservationValue::Monitor { reading, .. } => {
            format!("Monitor: {}", monitor_reading_label(*reading))
        }
        ObservationValue::UserMarkedPeak { .. } => "P anchor".to_owned(),
        _ => marker_label(value.marker_type()).to_owned(),
    }
}

const fn monitor_reading_label(reading: MonitorReading) -> &'static str {
    match reading {
        MonitorReading::Low => "Low",
        MonitorReading::High => "High",
        MonitorReading::Peak => "Peak",
        MonitorReading::Missed => "Missed",
        MonitorReading::Error => "Error",
    }
}

const fn marker_label(marker: MarkerType) -> &'static str {
    match marker {
        MarkerType::CycleStart => "Cycle start",
        MarkerType::MonitorSetup => "Monitor setup",
        MarkerType::Monitor => "Monitor",
        MarkerType::QuantitativeHormones => "Quantitative hormones",
        MarkerType::LhStrip => "LH strip",
        MarkerType::Bleeding => "Bleeding",
        MarkerType::Intercourse => "Intercourse",
        MarkerType::Mucus => "Mucus",
        MarkerType::Temperature => "Temperature",
        MarkerType::Note => "Note",
        MarkerType::UserMarkedPeak => "P anchor",
    }
}

#[uniffi::export]
#[allow(clippy::needless_pass_by_value)] // UniFFI owns lifted String arguments.
pub fn replay_fixture(fixture_json: String) -> Result<Vec<FfiChart>, FixtureReplayError> {
    let fixture: GoldenFixture =
        serde_json::from_str(&fixture_json).map_err(|_| FixtureReplayError::InvalidJson)?;
    Ok(build_charts(&fixture.observations)
        .into_iter()
        .map(FfiChart::from)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use verelle_auth::{
        generate_server_setup, server_login_finish, server_login_start, server_registration_finish,
        server_registration_start,
    };

    #[test]
    fn fixture_replay_matches_the_compact_rust_chart() {
        let fixture_json = include_str!("../../../fixtures/regular-cycle.json");
        let charts = replay_fixture(fixture_json.to_owned()).unwrap();
        let fixture: GoldenFixture = serde_json::from_str(fixture_json).unwrap();

        assert_eq!(charts.len(), fixture.expected.len());
        assert_eq!(charts[0].days.len(), fixture.expected[0].days.len());
        assert_eq!(charts[0].days[2].markers, ["monitor", "user_marked_peak"]);
        assert_eq!(charts[0].days[2].entries[0].label, "Monitor: Peak");
        assert_eq!(charts[0].days[2].annotations, ["P"]);
        assert_eq!(charts[0].days[5].annotations, ["P+3"]);
    }

    #[test]
    fn invalid_fixture_is_a_typed_error() {
        assert!(matches!(
            replay_fixture("not JSON".to_owned()),
            Err(FixtureReplayError::InvalidJson)
        ));
    }

    #[test]
    fn local_repository_records_and_reopens_without_losing_the_outbox() {
        let file = tempfile::NamedTempFile::new().unwrap();
        let path = file.path().to_string_lossy().into_owned();
        let key = vec![7_u8; 32];

        {
            let repository =
                LocalRepository::open(path.clone(), key.clone(), "device-a".to_owned()).unwrap();
            repository
                .record_cycle_start("2026-07-01".to_owned(), 1)
                .unwrap();
            repository
                .record_monitor_reading("2026-07-02".to_owned(), FfiMonitorReading::Low)
                .unwrap();
            assert_eq!(repository.pending_outbox_count().unwrap(), 2);
        }

        let reopened = LocalRepository::open(path, key, "device-a".to_owned()).unwrap();
        let charts = reopened.charts().unwrap();
        assert_eq!(charts.len(), 1);
        assert_eq!(charts[0].days.len(), 2);
        assert_eq!(charts[0].days[1].entries[0].label, "Monitor: Low");
        assert_eq!(reopened.pending_outbox_count().unwrap(), 2);
    }

    #[test]
    fn typed_sync_batch_and_pull_echo_advance_the_durable_cursor() {
        let file = tempfile::NamedTempFile::new().unwrap();
        let repository = LocalRepository::open(
            file.path().to_string_lossy().into_owned(),
            vec![9_u8; 32],
            "device-a".to_owned(),
        )
        .unwrap();
        repository
            .record_cycle_start("2026-07-19".to_owned(), 1)
            .unwrap();

        let batch = repository.sync_batch(100).unwrap();
        assert_eq!(batch.after_cursor, 0);
        assert_eq!(batch.operations.len(), 1);
        repository
            .apply_pull_page(FfiPullPage {
                after_cursor: 0,
                next_cursor: 1,
                operations: vec![FfiSequencedTransportOperation {
                    server_sequence: 1,
                    operation: batch.operations[0].clone(),
                }],
                more: false,
            })
            .unwrap();

        assert_eq!(repository.pending_outbox_count().unwrap(), 0);
        let caught_up = repository.sync_batch(100).unwrap();
        assert_eq!(caught_up.after_cursor, 1);
        assert!(caught_up.operations.is_empty());
    }

    #[test]
    fn local_repository_rejects_wrong_key_and_invalid_input() {
        let file = tempfile::NamedTempFile::new().unwrap();
        let path = file.path().to_string_lossy().into_owned();
        let repository =
            LocalRepository::open(path.clone(), vec![4_u8; 32], "device-a".to_owned()).unwrap();
        assert!(matches!(
            repository.record_cycle_start("07/01/2026".to_owned(), 1),
            Err(LocalRepositoryError::InvalidDate)
        ));
        assert!(repository.charts().unwrap().is_empty());
        drop(repository);

        assert!(matches!(
            LocalRepository::open(path, vec![5_u8; 32], "device-a".to_owned()),
            Err(LocalRepositoryError::KeyMismatch)
        ));
    }

    #[test]
    fn android_opaque_boundary_registers_and_logs_in_with_a_pinned_server_key() {
        let password = b"correct horse battery staple";
        let email = "founder@example.com";
        let identifier = account_credential_identifier(email).unwrap();
        let setup = generate_server_setup();
        let repository = LocalRepository::open(
            tempfile::NamedTempFile::new()
                .unwrap()
                .path()
                .to_string_lossy()
                .into_owned(),
            vec![6_u8; 32],
            Uuid::new_v4().to_string(),
        )
        .unwrap();

        let registration = opaque_registration_start(password.to_vec()).unwrap();
        let registration_response =
            server_registration_start(&setup, &identifier, &registration.request).unwrap();
        let material = repository
            .finish_account_registration(
                registration.state,
                password.to_vec(),
                email.to_owned(),
                registration_response,
            )
            .unwrap();
        let password_file = server_registration_finish(&material.registration_upload).unwrap();
        assert!(!material.recovery_code.is_empty());
        assert!(!material.wrapped_account_key.is_empty());
        assert!(!material.wrapped_dataset_key.is_empty());

        let login = opaque_login_start(password.to_vec()).unwrap();
        let server_login =
            server_login_start(&setup, Some(&password_file), &identifier, &login.request).unwrap();
        let client_login = opaque_login_finish(
            login.state,
            password.to_vec(),
            email.to_owned(),
            server_login.response,
            material.server_public_key,
        )
        .unwrap();
        assert!(
            server_login_finish(
                &server_login.state,
                &identifier,
                &client_login.credential_finalization,
            )
            .is_ok()
        );
    }

    #[test]
    fn android_opaque_login_rejects_a_changed_server_key() {
        let password = b"correct horse battery staple";
        let email = "founder@example.com";
        let identifier = account_credential_identifier(email).unwrap();
        let setup = generate_server_setup();
        let registration = opaque_registration_start(password.to_vec()).unwrap();
        let response =
            server_registration_start(&setup, &identifier, &registration.request).unwrap();
        let finished =
            client_registration_finish(&registration.state, password, &identifier, &response)
                .unwrap();
        let password_file = server_registration_finish(&finished.upload).unwrap();
        let login = opaque_login_start(password.to_vec()).unwrap();
        let server_login =
            server_login_start(&setup, Some(&password_file), &identifier, &login.request).unwrap();
        assert!(matches!(
            opaque_login_finish(
                login.state,
                password.to_vec(),
                email.to_owned(),
                server_login.response,
                vec![0; 32],
            ),
            Err(AccountAuthError::ServerKeyChanged)
        ));
    }
}

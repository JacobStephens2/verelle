//! Typed native boundary for platform shells.
//!
//! The boundary owns local persistence, HLC advancement, encrypted outbox
//! creation, and chart rebuilding. Platform code supplies a data key unwrapped
//! from its secure storage. No exported type represents protocol interpretation
//! or computed fertility status.

use chrono::NaiveDate;
use sha2::{Digest, Sha256};
use std::{
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use thiserror::Error;
use uuid::Uuid;
use verelle_core::{
    CycleChart, CycleStartBasis, GoldenFixture, MarkerType, MonitorReading, Observation,
    ObservationValue, build_charts,
};
use verelle_crypto::SecretKey;
use verelle_store::Store;
use verelle_sync::{HybridClock, PlainOperation, encrypt_operation};

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

    pub fn pending_outbox_count(&self) -> Result<u64, LocalRepositoryError> {
        let count = self
            .lock()?
            .store
            .pending_outbox(100_000)
            .map_err(|_| LocalRepositoryError::Storage)?
            .len();
        u64::try_from(count).map_err(|_| LocalRepositoryError::Storage)
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
}

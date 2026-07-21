//! Narrow native-shell bridge over Verelle's record-and-display chart core.
//!
//! The FFI surface is deliberately typed and contains no fertility
//! interpretation. Native shells send typed local recording commands and
//! receive chart records produced by the same Rust implementation used in
//! tests; fixture JSON remains available only as an architecture-test path.

#![allow(clippy::needless_pass_by_value)] // UniFFI owns boundary values by design.

use chrono::NaiveDate;
use std::sync::{Arc, Mutex, MutexGuard};
use thiserror::Error;
use uuid::Uuid;
use verelle_core::{
    BleedingIntensity, CycleChart, CycleStartBasis, GoldenFixture, IntercourseKind, LhQualitative,
    MarkerType, MonitorReading, MucusAppearance, MucusCategory, MucusSensation, Observation,
    ObservationValue, PeakSource, RecordKey, TemperatureUnit, build_charts,
};
use verelle_crypto::SecretKey;
use verelle_store::Store;
use verelle_sync::{HybridClock, PlainOperation, encrypt_operation};

uniffi::setup_scaffolding!();

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct ChartDay {
    pub date: String,
    pub cycle_day: u32,
    pub markers: Vec<String>,
    pub observations: Vec<ChartObservation>,
    pub annotations: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct ChartObservation {
    pub marker: String,
    pub summary: String,
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct ChartCycle {
    pub cycle_id: String,
    pub start_date: String,
    pub basis: String,
    pub method_cycle_number: u32,
    pub postpartum_cycle_number: Option<u32>,
    pub days: Vec<ChartDay>,
}

#[derive(Debug, Error, uniffi::Error)]
pub enum VerelleFfiError {
    #[error("fixture JSON is invalid: {reason}")]
    InvalidFixture { reason: String },
    #[error("fixture observation is invalid: {reason}")]
    InvalidObservation { reason: String },
    #[error("date is invalid: {reason}")]
    InvalidDate { reason: String },
    #[error("dataset identifier is invalid: {reason}")]
    InvalidDatasetId { reason: String },
    #[error("local dataset key must contain exactly 32 bytes")]
    InvalidDatasetKey,
    #[error("input is invalid: {reason}")]
    InvalidInput { reason: String },
    #[error("local store failed: {reason}")]
    Store { reason: String },
    #[error("local store lock is unavailable")]
    StoreLock,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum CycleBasisInput {
    Menses,
    ArtificialPostpartum,
    ReturnToCycles,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum MonitorReadingInput {
    Low,
    High,
    Peak,
    Missed,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum BleedingIntensityInput {
    Spotting,
    Light,
    Moderate,
    Heavy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum PeakSourceInput {
    Monitor,
    Mucus,
    LhStrip,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum EditableMarker {
    CycleStart,
    Monitor,
    Bleeding,
    Note,
    UserMarkedPeak,
}

struct LocalStoreState {
    store: Store,
    clock: HybridClock,
}

/// Crash-safe local-only chart storage for native phone shells.
///
/// The native shell owns platform key custody and supplies a 32-byte dataset
/// key unwrapped from Android Keystore or the iOS Keychain. Rust owns `SQLite`,
/// HLC ordering, encrypted outbox creation, chart layout, and export.
#[derive(uniffi::Object)]
pub struct LocalChartStore {
    state: Mutex<LocalStoreState>,
    dataset_id: Uuid,
    dataset_key: SecretKey,
    device_id: String,
}

#[uniffi::export]
impl LocalChartStore {
    #[uniffi::constructor]
    pub fn open(
        database_path: String,
        dataset_id: String,
        device_id: String,
        dataset_key: Vec<u8>,
    ) -> Result<Arc<Self>, VerelleFfiError> {
        if device_id.trim().is_empty() {
            return Err(VerelleFfiError::InvalidInput {
                reason: "device_id must not be blank".to_owned(),
            });
        }
        let dataset_id =
            Uuid::parse_str(&dataset_id).map_err(|error| VerelleFfiError::InvalidDatasetId {
                reason: error.to_string(),
            })?;
        let key_bytes: [u8; 32] = dataset_key
            .try_into()
            .map_err(|_| VerelleFfiError::InvalidDatasetKey)?;
        let store = Store::open(database_path).map_err(store_error)?;
        let clock = HybridClock::new(
            device_id.clone(),
            store.max_version_seen().map_err(store_error)?.as_ref(),
        );
        Ok(Arc::new(Self {
            state: Mutex::new(LocalStoreState { store, clock }),
            dataset_id,
            dataset_key: SecretKey::from_bytes(key_bytes),
            device_id,
        }))
    }

    pub fn charts(&self) -> Result<Vec<ChartCycle>, VerelleFfiError> {
        let state = self.lock()?;
        let observations = state
            .store
            .materialized_observations()
            .map_err(store_error)?;
        Ok(build_charts(&observations)
            .into_iter()
            .map(ChartCycle::from)
            .collect())
    }

    pub fn record_cycle_start(
        &self,
        date: String,
        basis: CycleBasisInput,
        method_cycle_number: Option<u32>,
        postpartum_cycle_number: Option<u32>,
        recorded_at_ms: i64,
    ) -> Result<(), VerelleFfiError> {
        let date = parse_date(&date)?;
        let existing_cycle_id = {
            let state = self.lock()?;
            state
                .store
                .materialized_observations()
                .map_err(store_error)?
                .into_iter()
                .find_map(|observation| {
                    if observation.date != date {
                        return None;
                    }
                    if let ObservationValue::CycleStart { cycle_id, .. } = observation.value {
                        Some(cycle_id)
                    } else {
                        None
                    }
                })
        };
        self.record(
            date,
            ObservationValue::CycleStart {
                cycle_id: existing_cycle_id.unwrap_or_else(Uuid::new_v4),
                basis: basis.into(),
                method_cycle_number,
                postpartum_cycle_number,
            },
            recorded_at_ms,
        )
    }

    pub fn record_monitor(
        &self,
        date: String,
        reading: MonitorReadingInput,
        recorded_at_ms: i64,
    ) -> Result<(), VerelleFfiError> {
        self.record(
            parse_date(&date)?,
            ObservationValue::Monitor {
                reading: reading.into(),
                test_requested: true,
                test_time: None,
                first_morning_urine: None,
                error_code: None,
            },
            recorded_at_ms,
        )
    }

    pub fn record_bleeding(
        &self,
        date: String,
        intensity: BleedingIntensityInput,
        recorded_at_ms: i64,
    ) -> Result<(), VerelleFfiError> {
        self.record(
            parse_date(&date)?,
            ObservationValue::Bleeding {
                intensity: intensity.into(),
            },
            recorded_at_ms,
        )
    }

    pub fn record_note(
        &self,
        date: String,
        text: String,
        recorded_at_ms: i64,
    ) -> Result<(), VerelleFfiError> {
        let text = text.trim().to_owned();
        if text.is_empty() {
            return Err(VerelleFfiError::InvalidInput {
                reason: "note must not be blank".to_owned(),
            });
        }
        self.record(
            parse_date(&date)?,
            ObservationValue::Note { text },
            recorded_at_ms,
        )
    }

    pub fn record_user_marked_peak(
        &self,
        date: String,
        source: PeakSourceInput,
        recorded_at_ms: i64,
    ) -> Result<(), VerelleFfiError> {
        self.record(
            parse_date(&date)?,
            ObservationValue::UserMarkedPeak {
                source: source.into(),
            },
            recorded_at_ms,
        )
    }

    pub fn delete_marker(
        &self,
        date: String,
        marker: EditableMarker,
        recorded_at_ms: i64,
    ) -> Result<(), VerelleFfiError> {
        let record_key = RecordKey {
            date: parse_date(&date)?,
            marker: marker.into(),
        };
        let mut state = self.lock()?;
        let version = state.clock.tick(recorded_at_ms);
        let operation = PlainOperation::tombstone(record_key.clone(), version);
        let transport = encrypt_operation(&self.dataset_key, 1, self.dataset_id, &operation)
            .map_err(store_error)?;
        state
            .store
            .append_local(&operation, &transport)
            .map_err(store_error)?;
        let superseded = state
            .store
            .superseded_operation_ids(&record_key)
            .map_err(store_error)?;
        state
            .store
            .purge_redacted_operations(&record_key, &superseded)
            .map_err(store_error)?;
        Ok(())
    }

    pub fn export_json(&self) -> Result<String, VerelleFfiError> {
        self.lock()?.store.export_json().map_err(store_error)
    }

    pub fn export_csv(&self) -> Result<String, VerelleFfiError> {
        self.lock()?.store.export_csv().map_err(store_error)
    }
}

impl LocalChartStore {
    fn lock(&self) -> Result<MutexGuard<'_, LocalStoreState>, VerelleFfiError> {
        self.state.lock().map_err(|_| VerelleFfiError::StoreLock)
    }

    fn record(
        &self,
        date: NaiveDate,
        value: ObservationValue,
        recorded_at_ms: i64,
    ) -> Result<(), VerelleFfiError> {
        let mut state = self.lock()?;
        let version = state.clock.tick(recorded_at_ms);
        let observation = Observation {
            id: Uuid::new_v4(),
            date,
            value,
            recorded_by: self.device_id.clone(),
            version,
        };
        observation
            .validate()
            .map_err(|error| VerelleFfiError::InvalidObservation {
                reason: error.to_string(),
            })?;
        let operation = PlainOperation::upsert(observation);
        let transport = encrypt_operation(&self.dataset_key, 1, self.dataset_id, &operation)
            .map_err(store_error)?;
        state
            .store
            .append_local(&operation, &transport)
            .map_err(store_error)?;
        Ok(())
    }
}

fn parse_date(date: &str) -> Result<NaiveDate, VerelleFfiError> {
    NaiveDate::parse_from_str(date, "%Y-%m-%d").map_err(|error| VerelleFfiError::InvalidDate {
        reason: error.to_string(),
    })
}

fn store_error(error: impl std::fmt::Display) -> VerelleFfiError {
    VerelleFfiError::Store {
        reason: error.to_string(),
    }
}

impl From<CycleBasisInput> for CycleStartBasis {
    fn from(value: CycleBasisInput) -> Self {
        match value {
            CycleBasisInput::Menses => Self::Menses,
            CycleBasisInput::ArtificialPostpartum => Self::ArtificialPostpartum,
            CycleBasisInput::ReturnToCycles => Self::ReturnToCycles,
        }
    }
}

impl From<MonitorReadingInput> for MonitorReading {
    fn from(value: MonitorReadingInput) -> Self {
        match value {
            MonitorReadingInput::Low => Self::Low,
            MonitorReadingInput::High => Self::High,
            MonitorReadingInput::Peak => Self::Peak,
            MonitorReadingInput::Missed => Self::Missed,
            MonitorReadingInput::Error => Self::Error,
        }
    }
}

impl From<BleedingIntensityInput> for BleedingIntensity {
    fn from(value: BleedingIntensityInput) -> Self {
        match value {
            BleedingIntensityInput::Spotting => Self::Spotting,
            BleedingIntensityInput::Light => Self::Light,
            BleedingIntensityInput::Moderate => Self::Moderate,
            BleedingIntensityInput::Heavy => Self::Heavy,
        }
    }
}

impl From<PeakSourceInput> for PeakSource {
    fn from(value: PeakSourceInput) -> Self {
        match value {
            PeakSourceInput::Monitor => Self::Monitor,
            PeakSourceInput::Mucus => Self::Mucus,
            PeakSourceInput::LhStrip => Self::LhStrip,
            PeakSourceInput::Other => Self::Other,
        }
    }
}

impl From<EditableMarker> for MarkerType {
    fn from(value: EditableMarker) -> Self {
        match value {
            EditableMarker::CycleStart => Self::CycleStart,
            EditableMarker::Monitor => Self::Monitor,
            EditableMarker::Bleeding => Self::Bleeding,
            EditableMarker::Note => Self::Note,
            EditableMarker::UserMarkedPeak => Self::UserMarkedPeak,
        }
    }
}

/// Replay one golden-fixture document and return its typed chart structure.
///
/// The fixture's expected output is intentionally ignored here: Rust renders
/// from observations, and native tests compare the returned records with the
/// checked-in expectation independently.
#[uniffi::export]
pub fn render_fixture(fixture_json: String) -> Result<Vec<ChartCycle>, VerelleFfiError> {
    let fixture: GoldenFixture =
        serde_json::from_str(&fixture_json).map_err(|error| VerelleFfiError::InvalidFixture {
            reason: error.to_string(),
        })?;
    for observation in &fixture.observations {
        observation
            .validate()
            .map_err(|error| VerelleFfiError::InvalidObservation {
                reason: error.to_string(),
            })?;
    }
    Ok(build_charts(&fixture.observations)
        .into_iter()
        .map(ChartCycle::from)
        .collect())
}

impl From<CycleChart> for ChartCycle {
    fn from(chart: CycleChart) -> Self {
        Self {
            cycle_id: chart.cycle_id.to_string(),
            start_date: chart.start_date.to_string(),
            basis: basis_label(chart.basis).to_owned(),
            method_cycle_number: chart.method_cycle_number,
            postpartum_cycle_number: chart.postpartum_cycle_number,
            days: chart
                .days
                .into_iter()
                .map(|day| ChartDay {
                    date: day.date.to_string(),
                    cycle_day: day.cycle_day,
                    markers: day
                        .observations
                        .iter()
                        .map(|observation| observation.value.marker_type().to_string())
                        .collect(),
                    observations: day
                        .observations
                        .iter()
                        .map(|observation| ChartObservation {
                            marker: observation.value.marker_type().to_string(),
                            summary: observation_summary(&observation.value),
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

fn observation_summary(value: &ObservationValue) -> String {
    match value {
        ObservationValue::CycleStart { .. } => "Cycle start".to_owned(),
        ObservationValue::MonitorSetup { m_button_time, .. } => {
            format!("Monitor setup · {}", m_button_time.format("%H:%M"))
        }
        ObservationValue::Monitor { reading, .. } => {
            format!("Monitor · {}", monitor_reading_label(*reading))
        }
        ObservationValue::QuantitativeHormones {
            e3g,
            lh,
            e3g_unit,
            lh_unit,
        } => {
            let mut values = Vec::new();
            if let Some(value) = e3g {
                values.push(format_measurement("E3G", *value, e3g_unit.as_deref()));
            }
            if let Some(value) = lh {
                values.push(format_measurement("LH", *value, lh_unit.as_deref()));
            }
            if values.is_empty() {
                "Quantitative hormones".to_owned()
            } else {
                values.join(" · ")
            }
        }
        ObservationValue::LhStrip {
            qualitative,
            tc_ratio,
            numeric_lh,
            ..
        } => {
            let mut parts = vec![format!("LH strip · {}", lh_label(*qualitative))];
            if let Some(ratio) = tc_ratio {
                parts.push(format!("T/C {ratio}"));
            }
            if let Some(lh) = numeric_lh {
                parts.push(format!("LH {lh}"));
            }
            parts.join(" · ")
        }
        ObservationValue::Bleeding { intensity } => {
            format!("Bleeding · {}", bleeding_label(*intensity))
        }
        ObservationValue::Intercourse { kind, protected } => {
            let protection = match protected {
                Some(true) => " · protected",
                Some(false) => " · unprotected",
                None => "",
            };
            format!("{}{}", intercourse_label(*kind), protection)
        }
        ObservationValue::Mucus {
            sensation,
            appearance,
            category,
            ..
        } => {
            let mut parts = vec!["Mucus".to_owned()];
            if let Some(value) = sensation {
                parts.push(mucus_sensation_label(*value).to_owned());
            }
            if let Some(value) = appearance {
                parts.push(mucus_appearance_label(*value).to_owned());
            }
            if let Some(value) = category {
                parts.push(mucus_category_label(*value).to_owned());
            }
            parts.join(" · ")
        }
        ObservationValue::Temperature { value, unit, .. } => match unit {
            TemperatureUnit::Celsius => format!("Temperature · {value} °C"),
            TemperatureUnit::Fahrenheit => format!("Temperature · {value} °F"),
        },
        ObservationValue::Note { text } => format!("Note · {text}"),
        ObservationValue::UserMarkedPeak { source } => {
            format!("User-marked Peak · {}", peak_source_label(*source))
        }
    }
}

fn format_measurement(name: &str, value: f64, unit: Option<&str>) -> String {
    unit.map_or_else(
        || format!("{name} {value}"),
        |unit| format!("{name} {value} {unit}"),
    )
}

const fn monitor_reading_label(value: MonitorReading) -> &'static str {
    match value {
        MonitorReading::Low => "Low",
        MonitorReading::High => "High",
        MonitorReading::Peak => "Peak",
        MonitorReading::Missed => "Missed",
        MonitorReading::Error => "Error",
    }
}

const fn bleeding_label(value: BleedingIntensity) -> &'static str {
    match value {
        BleedingIntensity::Spotting => "Spotting",
        BleedingIntensity::Light => "Light",
        BleedingIntensity::Moderate => "Moderate",
        BleedingIntensity::Heavy => "Heavy",
    }
}

const fn lh_label(value: LhQualitative) -> &'static str {
    match value {
        LhQualitative::Negative => "Negative",
        LhQualitative::Positive => "Positive",
        LhQualitative::Invalid => "Invalid",
        LhQualitative::Indeterminate => "Indeterminate",
    }
}

const fn intercourse_label(value: IntercourseKind) -> &'static str {
    match value {
        IntercourseKind::GenitalContact => "Genital contact",
        IntercourseKind::Intercourse => "Intercourse",
        IntercourseKind::Withdrawal => "Withdrawal",
    }
}

const fn mucus_sensation_label(value: MucusSensation) -> &'static str {
    match value {
        MucusSensation::Dry => "Dry",
        MucusSensation::Damp => "Damp",
        MucusSensation::Wet => "Wet",
        MucusSensation::Slippery => "Slippery",
        MucusSensation::Other => "Other sensation",
    }
}

const fn mucus_appearance_label(value: MucusAppearance) -> &'static str {
    match value {
        MucusAppearance::None => "No visible mucus",
        MucusAppearance::Tacky => "Tacky",
        MucusAppearance::Creamy => "Creamy",
        MucusAppearance::Watery => "Watery",
        MucusAppearance::Clear => "Clear",
        MucusAppearance::Stretchy => "Stretchy",
        MucusAppearance::Other => "Other appearance",
    }
}

const fn mucus_category_label(value: MucusCategory) -> &'static str {
    match value {
        MucusCategory::Low => "Low category",
        MucusCategory::High => "High category",
        MucusCategory::Peak => "Peak category",
    }
}

const fn peak_source_label(value: PeakSource) -> &'static str {
    match value {
        PeakSource::Monitor => "Monitor",
        PeakSource::Mucus => "Mucus",
        PeakSource::LhStrip => "LH strip",
        PeakSource::Other => "Other",
    }
}

const fn basis_label(basis: CycleStartBasis) -> &'static str {
    match basis {
        CycleStartBasis::Menses => "menses",
        CycleStartBasis::ArtificialPostpartum => "artificial_postpartum",
        CycleStartBasis::ReturnToCycles => "return_to_cycles",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    #[test]
    fn typed_surface_matches_the_regular_cycle_golden_structure() {
        let fixture_json = include_str!("../../../fixtures/regular-cycle.json");
        let fixture: GoldenFixture = serde_json::from_str(fixture_json).unwrap();
        let rendered = render_fixture(fixture_json.to_owned()).unwrap();

        assert_eq!(rendered.len(), fixture.expected.len());
        let chart = &rendered[0];
        let expected = &fixture.expected[0];
        assert_eq!(chart.start_date, expected.start_date.to_string());
        assert_eq!(chart.basis, "menses");
        assert_eq!(chart.method_cycle_number, expected.method_cycle_number);
        assert_eq!(chart.days.len(), expected.days.len());
        for (day, expected_day) in chart.days.iter().zip(&expected.days) {
            assert_eq!(day.date, expected_day.date.to_string());
            assert_eq!(day.cycle_day, expected_day.cycle_day);
            assert_eq!(
                day.markers,
                expected_day
                    .markers
                    .iter()
                    .map(ToString::to_string)
                    .collect::<Vec<_>>()
            );
            assert_eq!(day.annotations, expected_day.annotations);
        }
    }

    #[test]
    fn malformed_and_structurally_invalid_fixtures_fail_closed() {
        assert!(matches!(
            render_fixture("not json".to_owned()),
            Err(VerelleFfiError::InvalidFixture { .. })
        ));

        let fixture = include_str!("../../../fixtures/regular-cycle.json").replacen(
            "\"method_cycle_number\": 4",
            "\"method_cycle_number\": 0",
            1,
        );
        assert!(matches!(
            render_fixture(fixture),
            Err(VerelleFfiError::InvalidObservation { .. })
        ));
    }

    #[test]
    fn local_store_records_reopens_exports_and_deletes() {
        let database = NamedTempFile::new().unwrap();
        let path = database.path().to_string_lossy().into_owned();
        let dataset_id = Uuid::new_v4().to_string();
        let key = vec![7; 32];
        let store = LocalChartStore::open(
            path.clone(),
            dataset_id.clone(),
            "android-test-device".to_owned(),
            key.clone(),
        )
        .unwrap();
        store
            .record_cycle_start(
                "2026-07-20".to_owned(),
                CycleBasisInput::Menses,
                Some(1),
                None,
                100,
            )
            .unwrap();
        store
            .record_monitor("2026-07-20".to_owned(), MonitorReadingInput::Low, 101)
            .unwrap();
        store
            .record_user_marked_peak("2026-07-20".to_owned(), PeakSourceInput::Monitor, 102)
            .unwrap();

        let charts = store.charts().unwrap();
        assert_eq!(charts.len(), 1);
        assert_eq!(charts[0].days[0].annotations, ["P"]);
        assert!(store.export_csv().unwrap().contains("user_marked_peak"));
        drop(store);

        let reopened =
            LocalChartStore::open(path, dataset_id, "android-test-device".to_owned(), key).unwrap();
        assert_eq!(reopened.charts().unwrap().len(), 1);
        reopened
            .delete_marker("2026-07-20".to_owned(), EditableMarker::Monitor, 103)
            .unwrap();
        assert!(
            !reopened
                .export_json()
                .unwrap()
                .contains("\"type\": \"monitor\"")
        );
    }
}

//! Typed native boundary for platform shells.
//!
//! The boundary owns local persistence, HLC advancement, encrypted outbox
//! creation, and chart rebuilding. Platform code supplies a data key unwrapped
//! from its secure storage. No exported type represents protocol interpretation
//! or computed fertility status.

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{NaiveDate, NaiveTime};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use thiserror::Error;
use uuid::Uuid;
use verelle_api::{
    OpaqueMessage, RecoveryFinishRequest, login_device_proof_message,
    recovery_account_proof_message, registration_device_proof_message,
};
use verelle_auth::{
    AuthProtocolError, account_credential_identifier, client_login_finish, client_login_start,
    client_registration_finish, client_registration_start, derive_account_wrapping_key,
};
use verelle_core::{
    BleedingIntensity, CycleChart, CycleStartBasis, GoldenFixture, IntercourseKind, LhQualitative,
    MarkerType, MonitorReading, MucusAppearance, MucusCategory, MucusSensation, Observation,
    ObservationValue, PeakSource, RecordKey, TemperatureUnit, build_charts,
};
use verelle_crypto::{
    EncryptedEnvelope, RecoveryCode, SecretKey, recovery_public_key, sign_recovery_message,
    unwrap_secret_key, wrap_secret_key,
};
use verelle_store::{RemoteOperation, RemotePage, Store};
use verelle_sync::{
    HybridClock, PlainOperation, TransportOp, decrypt_operation, encrypt_operation,
};

uniffi::setup_scaffolding!();

const LOCAL_KEY_EPOCH: u64 = 1;
const LOCAL_DATASET_ID_SETTING: &str = "local_dataset_id";
const LOCAL_KEY_FINGERPRINT_SETTING: &str = "local_key_fingerprint";
const LOCAL_ACCOUNT_KEY_SETTING: &str = "local_account_key_wrap";
const COUPLE_INVITE_VERSION: u8 = 1;

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

/// Replacement account material created after recovery-code authorization.
///
/// The random account key never crosses the native boundary. The recovered
/// dataset key must be handed directly to Android's Keystore-backed local-key
/// store and zeroized by the caller after persistence.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct FfiAccountRecoveryMaterial {
    pub registration_upload: Vec<u8>,
    pub server_public_key: Vec<u8>,
    pub wrapped_account_key: Vec<u8>,
    pub recovery_wrapped_account_key: Vec<u8>,
    pub wrapped_dataset_key: Vec<u8>,
    pub recovery_signature: Vec<u8>,
    pub recovered_dataset_key: Vec<u8>,
    pub local_account_key_wrap: Vec<u8>,
    pub recovery_code: String,
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct FfiCoupleInviteCreation {
    pub invite_code: String,
    pub invite_id: String,
    pub verifier_base64url: String,
    pub dataset_id: String,
    pub key_epoch: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct FfiCoupleInviteAcceptance {
    pub invite_id: String,
    pub verifier_base64url: String,
    pub dataset_id: String,
    pub key_epoch: u64,
    pub wrapped_dataset_key: Vec<u8>,
    pub recovered_dataset_key: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct CoupleInviteCode {
    version: u8,
    invite_id: Uuid,
    dataset_id: Uuid,
    key_epoch: u64,
    secret_base64url: String,
    wrapped_dataset_key_base64url: String,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum FfiCycleStartBasis {
    Menses,
    ArtificialPostpartum,
    ReturnToCycles,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum FfiBleedingIntensity {
    Spotting,
    Light,
    Moderate,
    Heavy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum FfiIntercourseKind {
    GenitalContact,
    Intercourse,
    Withdrawal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum FfiLhQualitative {
    Negative,
    Positive,
    Invalid,
    Indeterminate,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum FfiMucusSensation {
    Dry,
    Damp,
    Wet,
    Slippery,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum FfiMucusAppearance {
    None,
    Tacky,
    Creamy,
    Watery,
    Clear,
    Stretchy,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum FfiMucusCategory {
    Low,
    High,
    Peak,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum FfiTemperatureUnit {
    Celsius,
    Fahrenheit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum FfiPeakSource {
    Monitor,
    Mucus,
    LhStrip,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum FfiEditableMarker {
    CycleStart,
    MonitorSetup,
    Monitor,
    QuantitativeHormones,
    LhStrip,
    Bleeding,
    Intercourse,
    Mucus,
    Temperature,
    Note,
    UserMarkedPeak,
}

#[derive(Debug, Error, uniffi::Error)]
pub enum LocalRepositoryError {
    #[error("the local data key must contain exactly 32 bytes")]
    InvalidKey,
    #[error("the local data key does not match this database")]
    KeyMismatch,
    #[error("the recording date must use YYYY-MM-DD")]
    InvalidDate,
    #[error("a time must use HH:MM or HH:MM:SS")]
    InvalidTime,
    #[error("the observation contains invalid structural data")]
    InvalidInput,
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
    #[error("the recovered dataset identifier is invalid")]
    InvalidDatasetIdentifier,
    #[error("the local repository already contains chart data")]
    RepositoryNotPristine,
    #[error("the account authentication exchange is invalid")]
    InvalidAuthenticationExchange,
    #[error("account key protection failed")]
    AccountKeyProtection,
    #[error("the local account key is unavailable; sign in or recover first")]
    AccountKeyUnavailable,
    #[error("the couple invite is invalid or expired")]
    InvalidCoupleInvite,
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
    #[error("the recovery response or recovery code is invalid")]
    InvalidRecoveryMaterial,
    #[error("account key protection failed")]
    AccountKeyProtection,
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
    account_key: Option<SecretKey>,
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
        let data_key = SecretKey::from_bytes(key_bytes);
        let account_key = store
            .setting::<Vec<u8>>(LOCAL_ACCOUNT_KEY_SETTING)
            .map_err(|_| LocalRepositoryError::Storage)?
            .map(|bytes| {
                let envelope = EncryptedEnvelope::from_bytes(&bytes)
                    .map_err(|_| LocalRepositoryError::AccountKeyProtection)?;
                unwrap_secret_key(
                    &data_key,
                    LOCAL_KEY_EPOCH,
                    b"local/account-key-wrap",
                    &envelope,
                )
                .map_err(|_| LocalRepositoryError::AccountKeyProtection)
            })
            .transpose()?;
        let persisted_clock = store
            .max_version_seen()
            .map_err(|_| LocalRepositoryError::Storage)?;
        let clock = HybridClock::new(device_id.clone(), persisted_clock.as_ref());

        Ok(Arc::new(Self {
            inner: Mutex::new(RepositoryInner {
                store,
                data_key,
                dataset_id,
                device_id,
                clock,
                account_key,
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
        self.record_cycle_start_details(
            date,
            FfiCycleStartBasis::Menses,
            Some(method_cycle_number),
            None,
        )
    }

    #[allow(clippy::needless_pass_by_value)] // UniFFI owns lifted values.
    pub fn record_cycle_start_details(
        &self,
        date: String,
        basis: FfiCycleStartBasis,
        method_cycle_number: Option<u32>,
        postpartum_cycle_number: Option<u32>,
    ) -> Result<(), LocalRepositoryError> {
        if method_cycle_number == Some(0) || postpartum_cycle_number == Some(0) {
            return Err(LocalRepositoryError::InvalidMethodCycleNumber);
        }
        let date = parse_date(&date)?;
        let mut inner = self.lock()?;
        let cycle_id = inner
            .store
            .materialized_observations()
            .map_err(|_| LocalRepositoryError::Storage)?
            .into_iter()
            .find_map(|observation| match observation.value {
                ObservationValue::CycleStart { cycle_id, .. } if observation.date == date => {
                    Some(cycle_id)
                }
                _ => None,
            })
            .unwrap_or_else(Uuid::new_v4);
        inner.append(
            date,
            ObservationValue::CycleStart {
                cycle_id,
                basis: basis.into(),
                method_cycle_number,
                postpartum_cycle_number,
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

    #[allow(clippy::needless_pass_by_value)] // UniFFI owns lifted values.
    pub fn record_monitor_setup(
        &self,
        date: String,
        m_button_time: String,
        monitor_model: Option<String>,
        memory_reset: bool,
    ) -> Result<(), LocalRepositoryError> {
        let monitor_model = monitor_model
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty());
        self.lock()?.append(
            parse_date(&date)?,
            ObservationValue::MonitorSetup {
                m_button_time: parse_time(&m_button_time)?,
                monitor_model,
                memory_reset,
                artificial_cycle_id: None,
            },
        )
    }

    #[allow(clippy::too_many_arguments, clippy::needless_pass_by_value)]
    pub fn record_monitor_details(
        &self,
        date: String,
        reading: FfiMonitorReading,
        test_requested: bool,
        test_time: Option<String>,
        first_morning_urine: Option<bool>,
        error_code: Option<String>,
    ) -> Result<(), LocalRepositoryError> {
        self.lock()?.append(
            parse_date(&date)?,
            ObservationValue::Monitor {
                reading: reading.into(),
                test_requested,
                test_time: parse_optional_time(test_time)?,
                first_morning_urine,
                error_code: error_code
                    .map(|value| value.trim().to_owned())
                    .filter(|value| !value.is_empty()),
            },
        )
    }

    #[allow(clippy::needless_pass_by_value)]
    pub fn record_quantitative_hormones(
        &self,
        date: String,
        e3g: Option<f64>,
        lh: Option<f64>,
        e3g_unit: Option<String>,
        lh_unit: Option<String>,
    ) -> Result<(), LocalRepositoryError> {
        self.lock()?.append(
            parse_date(&date)?,
            ObservationValue::QuantitativeHormones {
                e3g,
                lh,
                e3g_unit: trimmed_optional(e3g_unit),
                lh_unit: trimmed_optional(lh_unit),
            },
        )
    }

    #[allow(clippy::too_many_arguments, clippy::needless_pass_by_value)]
    pub fn record_lh_strip(
        &self,
        date: String,
        brand: Option<String>,
        qualitative: FfiLhQualitative,
        tc_ratio: Option<f64>,
        numeric_lh: Option<f64>,
        valid: bool,
        test_time: Option<String>,
    ) -> Result<(), LocalRepositoryError> {
        self.lock()?.append(
            parse_date(&date)?,
            ObservationValue::LhStrip {
                brand: trimmed_optional(brand),
                qualitative: qualitative.into(),
                tc_ratio,
                numeric_lh,
                valid,
                test_time: parse_optional_time(test_time)?,
            },
        )
    }

    #[allow(clippy::needless_pass_by_value)]
    pub fn record_bleeding(
        &self,
        date: String,
        intensity: FfiBleedingIntensity,
    ) -> Result<(), LocalRepositoryError> {
        self.lock()?.append(
            parse_date(&date)?,
            ObservationValue::Bleeding {
                intensity: intensity.into(),
            },
        )
    }

    #[allow(clippy::needless_pass_by_value)]
    pub fn record_intercourse(
        &self,
        date: String,
        kind: FfiIntercourseKind,
        protected: Option<bool>,
    ) -> Result<(), LocalRepositoryError> {
        self.lock()?.append(
            parse_date(&date)?,
            ObservationValue::Intercourse {
                kind: kind.into(),
                protected,
            },
        )
    }

    #[allow(clippy::too_many_arguments, clippy::needless_pass_by_value)]
    pub fn record_mucus(
        &self,
        date: String,
        sensation: Option<FfiMucusSensation>,
        appearance: Option<FfiMucusAppearance>,
        category: Option<FfiMucusCategory>,
        baseline_change: Option<bool>,
        confidence: Option<u8>,
    ) -> Result<(), LocalRepositoryError> {
        self.lock()?.append(
            parse_date(&date)?,
            ObservationValue::Mucus {
                sensation: sensation.map(Into::into),
                appearance: appearance.map(Into::into),
                category: category.map(Into::into),
                baseline_change,
                confidence,
            },
        )
    }

    #[allow(clippy::too_many_arguments, clippy::needless_pass_by_value)]
    pub fn record_temperature(
        &self,
        date: String,
        value: f64,
        unit: FfiTemperatureUnit,
        time: Option<String>,
        sleep_quality: Option<u8>,
        disturbed: bool,
    ) -> Result<(), LocalRepositoryError> {
        self.lock()?.append(
            parse_date(&date)?,
            ObservationValue::Temperature {
                value,
                unit: unit.into(),
                time: parse_optional_time(time)?,
                sleep_quality,
                disturbed,
            },
        )
    }

    #[allow(clippy::needless_pass_by_value)]
    pub fn record_note(&self, date: String, text: String) -> Result<(), LocalRepositoryError> {
        let text = text.trim().to_owned();
        if text.is_empty() {
            return Err(LocalRepositoryError::InvalidInput);
        }
        self.lock()?
            .append(parse_date(&date)?, ObservationValue::Note { text })
    }

    #[allow(clippy::needless_pass_by_value)]
    pub fn record_user_marked_peak(
        &self,
        date: String,
        source: FfiPeakSource,
    ) -> Result<(), LocalRepositoryError> {
        self.lock()?.append(
            parse_date(&date)?,
            ObservationValue::UserMarkedPeak {
                source: source.into(),
            },
        )
    }

    /// Appends the winning tombstone and returns the superseded operation IDs
    /// that a synced client must ask the server to redact before local purge.
    #[allow(clippy::needless_pass_by_value)]
    pub fn delete_marker(
        &self,
        date: String,
        marker: FfiEditableMarker,
    ) -> Result<Vec<String>, LocalRepositoryError> {
        let record_key = RecordKey {
            date: parse_date(&date)?,
            marker: marker.into(),
        };
        let mut inner = self.lock()?;
        let operation = PlainOperation::tombstone(record_key.clone(), inner.clock.tick(now_ms()?));
        let transport = encrypt_operation(
            &inner.data_key,
            LOCAL_KEY_EPOCH,
            inner.dataset_id,
            &operation,
        )
        .map_err(|_| LocalRepositoryError::Encryption)?;
        inner
            .store
            .append_local(&operation, &transport)
            .map_err(|_| LocalRepositoryError::Storage)?;
        inner
            .store
            .superseded_operation_ids(&record_key)
            .map_err(|_| LocalRepositoryError::Storage)
            .map(|ids| ids.into_iter().map(|id| id.to_string()).collect())
    }

    /// Purges superseded local plaintext after server redaction succeeds, or
    /// immediately for a dataset that has never been enrolled for sync.
    #[allow(clippy::needless_pass_by_value)]
    pub fn purge_marker_history(
        &self,
        date: String,
        marker: FfiEditableMarker,
        operation_ids: Vec<String>,
    ) -> Result<u64, LocalRepositoryError> {
        let operation_ids = operation_ids
            .into_iter()
            .map(|value| {
                Uuid::parse_str(&value).map_err(|_| LocalRepositoryError::InvalidOperationId)
            })
            .collect::<Result<Vec<_>, _>>()?;
        let mut inner = self.lock()?;
        let purged = inner
            .store
            .purge_redacted_operations(
                &RecordKey {
                    date: parse_date(&date)?,
                    marker: marker.into(),
                },
                &operation_ids,
            )
            .map_err(|_| LocalRepositoryError::Storage)?;
        u64::try_from(purged).map_err(|_| LocalRepositoryError::Storage)
    }

    pub fn export_json(&self) -> Result<String, LocalRepositoryError> {
        self.lock()?
            .store
            .export_json()
            .map_err(|_| LocalRepositoryError::Storage)
    }

    pub fn export_csv(&self) -> Result<String, LocalRepositoryError> {
        self.lock()?
            .store
            .export_csv()
            .map_err(|_| LocalRepositoryError::Storage)
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

    pub fn is_pristine(&self) -> Result<bool, LocalRepositoryError> {
        self.lock()?
            .store
            .is_pristine()
            .map_err(|_| LocalRepositoryError::Storage)
    }

    /// Atomically adopts the key and server dataset identity recovered from an
    /// existing account. A repository that has ever recorded or pulled an
    /// operation is rejected so local health data cannot be silently replaced.
    /// The caller must persist the same key with Android's
    /// `LocalDataKeyManager` before treating recovery as locally complete.
    #[allow(clippy::needless_pass_by_value)] // UniFFI owns lifted values.
    pub fn adopt_recovered_dataset(
        &self,
        mut key_material: Vec<u8>,
        dataset_id: String,
    ) -> Result<(), LocalRepositoryError> {
        if key_material.len() != 32 {
            key_material.fill(0);
            return Err(LocalRepositoryError::InvalidKey);
        }
        let dataset_id = match Uuid::parse_str(&dataset_id) {
            Ok(value) if !value.is_nil() && value.to_string() == dataset_id => value,
            _ => {
                key_material.fill(0);
                return Err(LocalRepositoryError::InvalidDatasetIdentifier);
            }
        };
        let mut key_bytes = [0_u8; 32];
        key_bytes.copy_from_slice(&key_material);
        let fingerprint = Sha256::digest(&key_material).to_vec();
        key_material.fill(0);

        let mut inner = self.lock()?;
        if !inner
            .store
            .is_pristine()
            .map_err(|_| LocalRepositoryError::Storage)?
        {
            return Err(LocalRepositoryError::RepositoryNotPristine);
        }
        let new_data_key = SecretKey::from_bytes(key_bytes);
        let mut settings = vec![
            (
                LOCAL_DATASET_ID_SETTING,
                serde_json::to_value(dataset_id).map_err(|_| LocalRepositoryError::Storage)?,
            ),
            (
                LOCAL_KEY_FINGERPRINT_SETTING,
                serde_json::to_value(&fingerprint).map_err(|_| LocalRepositoryError::Storage)?,
            ),
        ];
        if let Some(account_key) = &inner.account_key {
            let local_wrap = wrap_secret_key(
                &new_data_key,
                LOCAL_KEY_EPOCH,
                b"local/account-key-wrap",
                account_key,
            )
            .map_err(|_| LocalRepositoryError::AccountKeyProtection)?;
            settings.push((
                LOCAL_ACCOUNT_KEY_SETTING,
                serde_json::to_value(local_wrap.to_bytes())
                    .map_err(|_| LocalRepositoryError::Storage)?,
            ));
        }
        inner
            .store
            .set_settings_atomically(&settings)
            .map_err(|_| LocalRepositoryError::Storage)?;
        inner.dataset_id = dataset_id;
        inner.data_key = new_data_key;
        Ok(())
    }

    /// Atomically adopts a recovered dataset and the locally encrypted account
    /// key needed for couple invitations and future epoch rotation.
    #[allow(clippy::needless_pass_by_value)]
    pub fn adopt_recovered_account(
        &self,
        mut key_material: Vec<u8>,
        dataset_id: String,
        local_account_key_wrap: Vec<u8>,
    ) -> Result<(), LocalRepositoryError> {
        if key_material.len() != 32 {
            key_material.fill(0);
            return Err(LocalRepositoryError::InvalidKey);
        }
        let dataset_id = Uuid::parse_str(&dataset_id)
            .ok()
            .filter(|value| !value.is_nil() && value.to_string() == dataset_id)
            .ok_or(LocalRepositoryError::InvalidDatasetIdentifier)?;
        let mut key_bytes = [0_u8; 32];
        key_bytes.copy_from_slice(&key_material);
        let fingerprint = Sha256::digest(&key_material).to_vec();
        key_material.fill(0);
        let new_data_key = SecretKey::from_bytes(key_bytes);
        let local_envelope = EncryptedEnvelope::from_bytes(&local_account_key_wrap)
            .map_err(|_| LocalRepositoryError::AccountKeyProtection)?;
        let account_key = unwrap_secret_key(
            &new_data_key,
            LOCAL_KEY_EPOCH,
            b"local/account-key-wrap",
            &local_envelope,
        )
        .map_err(|_| LocalRepositoryError::AccountKeyProtection)?;

        let mut inner = self.lock()?;
        if !inner
            .store
            .is_pristine()
            .map_err(|_| LocalRepositoryError::Storage)?
        {
            return Err(LocalRepositoryError::RepositoryNotPristine);
        }
        inner
            .store
            .set_settings_atomically(&[
                (
                    LOCAL_DATASET_ID_SETTING,
                    serde_json::to_value(dataset_id).map_err(|_| LocalRepositoryError::Storage)?,
                ),
                (
                    LOCAL_KEY_FINGERPRINT_SETTING,
                    serde_json::to_value(&fingerprint)
                        .map_err(|_| LocalRepositoryError::Storage)?,
                ),
                (
                    LOCAL_ACCOUNT_KEY_SETTING,
                    serde_json::to_value(&local_account_key_wrap)
                        .map_err(|_| LocalRepositoryError::Storage)?,
                ),
            ])
            .map_err(|_| LocalRepositoryError::Storage)?;
        inner.dataset_id = dataset_id;
        inner.data_key = new_data_key;
        inner.account_key = Some(account_key);
        Ok(())
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
        let mut inner = self.lock()?;
        let wrapped_dataset_key = wrap_secret_key(
            &account_data_key,
            LOCAL_KEY_EPOCH,
            b"dataset/account-wrap",
            &inner.data_key,
        )
        .map_err(|_| LocalRepositoryError::AccountKeyProtection)?;
        let recovery_public_key = recovery_public_key(&account_data_key)
            .map_err(|_| LocalRepositoryError::AccountKeyProtection)?;
        let local_account_key_wrap = wrap_secret_key(
            &inner.data_key,
            LOCAL_KEY_EPOCH,
            b"local/account-key-wrap",
            &account_data_key,
        )
        .map_err(|_| LocalRepositoryError::AccountKeyProtection)?;
        inner
            .store
            .set_setting(
                LOCAL_ACCOUNT_KEY_SETTING,
                &local_account_key_wrap.to_bytes(),
            )
            .map_err(|_| LocalRepositoryError::Storage)?;
        inner.account_key = Some(account_data_key);

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

    /// Creates an end-to-end encrypted, one-use couple invitation. The server
    /// receives only the verifier; the secret capable of unwrapping the
    /// dataset key exists solely inside the user-shared invite code.
    pub fn create_couple_invite(&self) -> Result<FfiCoupleInviteCreation, LocalRepositoryError> {
        let inner = self.lock()?;
        if inner.account_key.is_none() {
            return Err(LocalRepositoryError::AccountKeyUnavailable);
        }
        let invite_id = Uuid::new_v4();
        let secret = SecretKey::random();
        let context = invite_context(invite_id, inner.dataset_id);
        let wrapped_dataset_key =
            wrap_secret_key(&secret, LOCAL_KEY_EPOCH, &context, &inner.data_key)
                .map_err(|_| LocalRepositoryError::AccountKeyProtection)?;
        let verifier = invite_verifier(invite_id, &secret);
        let code = CoupleInviteCode {
            version: COUPLE_INVITE_VERSION,
            invite_id,
            dataset_id: inner.dataset_id,
            key_epoch: LOCAL_KEY_EPOCH,
            secret_base64url: URL_SAFE_NO_PAD.encode(secret.expose()),
            wrapped_dataset_key_base64url: URL_SAFE_NO_PAD.encode(wrapped_dataset_key.to_bytes()),
        };
        let serialized =
            serde_json::to_vec(&code).map_err(|_| LocalRepositoryError::InvalidCoupleInvite)?;
        Ok(FfiCoupleInviteCreation {
            invite_code: URL_SAFE_NO_PAD.encode(serialized),
            invite_id: invite_id.to_string(),
            verifier_base64url: URL_SAFE_NO_PAD.encode(verifier),
            dataset_id: inner.dataset_id.to_string(),
            key_epoch: LOCAL_KEY_EPOCH,
        })
    }

    /// Validates and unwraps a couple invite locally, then produces the
    /// account-specific ciphertext the server stores after authenticated
    /// redemption. Call `adopt_recovered_dataset` only after redemption wins.
    #[allow(clippy::needless_pass_by_value)]
    pub fn prepare_couple_invite_acceptance(
        &self,
        invite_code: String,
    ) -> Result<FfiCoupleInviteAcceptance, LocalRepositoryError> {
        let code_bytes = URL_SAFE_NO_PAD
            .decode(invite_code)
            .map_err(|_| LocalRepositoryError::InvalidCoupleInvite)?;
        let code: CoupleInviteCode = serde_json::from_slice(&code_bytes)
            .map_err(|_| LocalRepositoryError::InvalidCoupleInvite)?;
        if code.version != COUPLE_INVITE_VERSION
            || code.invite_id.is_nil()
            || code.dataset_id.is_nil()
            || code.key_epoch != LOCAL_KEY_EPOCH
        {
            return Err(LocalRepositoryError::InvalidCoupleInvite);
        }
        let secret_bytes = URL_SAFE_NO_PAD
            .decode(code.secret_base64url)
            .map_err(|_| LocalRepositoryError::InvalidCoupleInvite)?;
        let secret: [u8; 32] = secret_bytes
            .try_into()
            .map_err(|_| LocalRepositoryError::InvalidCoupleInvite)?;
        let secret = SecretKey::from_bytes(secret);
        let wrapped_bytes = URL_SAFE_NO_PAD
            .decode(code.wrapped_dataset_key_base64url)
            .map_err(|_| LocalRepositoryError::InvalidCoupleInvite)?;
        let wrapped = EncryptedEnvelope::from_bytes(&wrapped_bytes)
            .map_err(|_| LocalRepositoryError::InvalidCoupleInvite)?;
        let dataset_key = unwrap_secret_key(
            &secret,
            code.key_epoch,
            &invite_context(code.invite_id, code.dataset_id),
            &wrapped,
        )
        .map_err(|_| LocalRepositoryError::InvalidCoupleInvite)?;
        let inner = self.lock()?;
        if !inner
            .store
            .is_pristine()
            .map_err(|_| LocalRepositoryError::Storage)?
        {
            return Err(LocalRepositoryError::RepositoryNotPristine);
        }
        let account_key = inner
            .account_key
            .as_ref()
            .ok_or(LocalRepositoryError::AccountKeyUnavailable)?;
        let account_wrap = wrap_secret_key(
            account_key,
            code.key_epoch,
            b"dataset/account-wrap",
            &dataset_key,
        )
        .map_err(|_| LocalRepositoryError::AccountKeyProtection)?;
        Ok(FfiCoupleInviteAcceptance {
            invite_id: code.invite_id.to_string(),
            verifier_base64url: URL_SAFE_NO_PAD.encode(invite_verifier(code.invite_id, &secret)),
            dataset_id: code.dataset_id.to_string(),
            key_epoch: code.key_epoch,
            wrapped_dataset_key: account_wrap.to_bytes(),
            recovered_dataset_key: dataset_key.expose().to_vec(),
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

/// Completes the new OPAQUE registration used by lost-device recovery and
/// rotates every client-side account wrap. The account data key remains inside
/// Rust; only the recovered dataset key needed by Android's local encrypted
/// store is returned.
#[uniffi::export]
#[allow(
    clippy::needless_pass_by_value,
    clippy::too_many_arguments,
    clippy::too_many_lines
)]
pub fn opaque_account_recovery_finish(
    mut state: Vec<u8>,
    mut password: Vec<u8>,
    account_identifier: String,
    registration_response: Vec<u8>,
    recovery_code: String,
    recovery_wrapped_account_key: Vec<u8>,
    wrapped_dataset_key: Vec<u8>,
    flow_id: String,
    device_id: String,
    dataset_id: String,
    recovery_challenge: Vec<u8>,
    device_public_key: Vec<u8>,
) -> Result<FfiAccountRecoveryMaterial, AccountAuthError> {
    let Ok(credential_identifier) = account_credential_identifier(&account_identifier) else {
        state.fill(0);
        password.fill(0);
        return Err(AccountAuthError::InvalidAccountIdentifier);
    };
    let finished = client_registration_finish(
        &state,
        &password,
        &credential_identifier,
        &registration_response,
    );
    state.fill(0);
    password.fill(0);
    let finished = finished.map_err(|_| AccountAuthError::InvalidAuthenticationExchange)?;

    let recovery_code = RecoveryCode::parse(recovery_code)
        .map_err(|_| AccountAuthError::InvalidRecoveryMaterial)?;
    let recovery_wrap = EncryptedEnvelope::from_bytes(&recovery_wrapped_account_key)
        .map_err(|_| AccountAuthError::InvalidRecoveryMaterial)?;
    let account_data_key = unwrap_secret_key(
        &recovery_code
            .wrapping_key()
            .map_err(|_| AccountAuthError::InvalidRecoveryMaterial)?,
        LOCAL_KEY_EPOCH,
        b"account/recovery-wrap",
        &recovery_wrap,
    )
    .map_err(|_| AccountAuthError::InvalidRecoveryMaterial)?;
    let dataset_wrap = EncryptedEnvelope::from_bytes(&wrapped_dataset_key)
        .map_err(|_| AccountAuthError::InvalidRecoveryMaterial)?;
    let dataset_key = unwrap_secret_key(
        &account_data_key,
        LOCAL_KEY_EPOCH,
        b"dataset/account-wrap",
        &dataset_wrap,
    )
    .map_err(|_| AccountAuthError::InvalidRecoveryMaterial)?;

    let password_wrapping_key = SecretKey::from_bytes(
        derive_account_wrapping_key(finished.export_key)
            .map_err(|_| AccountAuthError::AccountKeyProtection)?,
    );
    let wrapped_account_key = wrap_secret_key(
        &password_wrapping_key,
        LOCAL_KEY_EPOCH,
        b"account/password-wrap",
        &account_data_key,
    )
    .map_err(|_| AccountAuthError::AccountKeyProtection)?;
    let new_recovery_code = RecoveryCode::generate();
    let new_recovery_wrap = wrap_secret_key(
        &new_recovery_code
            .wrapping_key()
            .map_err(|_| AccountAuthError::AccountKeyProtection)?,
        LOCAL_KEY_EPOCH,
        b"account/recovery-wrap",
        &account_data_key,
    )
    .map_err(|_| AccountAuthError::AccountKeyProtection)?;
    let new_dataset_wrap = wrap_secret_key(
        &account_data_key,
        LOCAL_KEY_EPOCH,
        b"dataset/account-wrap",
        &dataset_key,
    )
    .map_err(|_| AccountAuthError::AccountKeyProtection)?;
    let local_account_key_wrap = wrap_secret_key(
        &dataset_key,
        LOCAL_KEY_EPOCH,
        b"local/account-key-wrap",
        &account_data_key,
    )
    .map_err(|_| AccountAuthError::AccountKeyProtection)?;

    let flow_id = parse_enrollment_id(&flow_id)?;
    let device_id = parse_enrollment_id(&device_id)?;
    let dataset_id = parse_enrollment_id(&dataset_id)?;
    if recovery_challenge.is_empty() || device_public_key.is_empty() {
        return Err(AccountAuthError::InvalidRecoveryMaterial);
    }
    let mut request = RecoveryFinishRequest {
        flow_id,
        device_id,
        dataset_id,
        registration_upload: OpaqueMessage::from_bytes(&finished.upload),
        device_public_key: OpaqueMessage::from_bytes(&device_public_key),
        // Neither signature is included in the recovery proof. The device
        // signature is produced by Android Keystore after this call.
        device_signature: OpaqueMessage::from_bytes(&[1]),
        recovery_signature: OpaqueMessage::from_bytes(&[1]),
        wrapped_account_key: OpaqueMessage::from_bytes(&wrapped_account_key.to_bytes()),
        recovery_wrapped_account_key: OpaqueMessage::from_bytes(&new_recovery_wrap.to_bytes()),
        wrapped_dataset_key: OpaqueMessage::from_bytes(&new_dataset_wrap.to_bytes()),
    };
    let recovery_proof = recovery_account_proof_message(&request, &recovery_challenge);
    let recovery_signature = sign_recovery_message(&account_data_key, &recovery_proof)
        .map_err(|_| AccountAuthError::AccountKeyProtection)?;
    request.recovery_signature = OpaqueMessage::from_bytes(&recovery_signature);

    Ok(FfiAccountRecoveryMaterial {
        registration_upload: finished.upload,
        server_public_key: finished.server_public_key,
        wrapped_account_key: wrapped_account_key.to_bytes(),
        recovery_wrapped_account_key: new_recovery_wrap.to_bytes(),
        wrapped_dataset_key: new_dataset_wrap.to_bytes(),
        recovery_signature,
        recovered_dataset_key: dataset_key.expose().to_vec(),
        local_account_key_wrap: local_account_key_wrap.to_bytes(),
        recovery_code: new_recovery_code.as_str().to_owned(),
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
        value
            .validate()
            .map_err(|_| LocalRepositoryError::InvalidInput)?;
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

impl From<FfiCycleStartBasis> for CycleStartBasis {
    fn from(value: FfiCycleStartBasis) -> Self {
        match value {
            FfiCycleStartBasis::Menses => Self::Menses,
            FfiCycleStartBasis::ArtificialPostpartum => Self::ArtificialPostpartum,
            FfiCycleStartBasis::ReturnToCycles => Self::ReturnToCycles,
        }
    }
}

impl From<FfiBleedingIntensity> for BleedingIntensity {
    fn from(value: FfiBleedingIntensity) -> Self {
        match value {
            FfiBleedingIntensity::Spotting => Self::Spotting,
            FfiBleedingIntensity::Light => Self::Light,
            FfiBleedingIntensity::Moderate => Self::Moderate,
            FfiBleedingIntensity::Heavy => Self::Heavy,
        }
    }
}

impl From<FfiIntercourseKind> for IntercourseKind {
    fn from(value: FfiIntercourseKind) -> Self {
        match value {
            FfiIntercourseKind::GenitalContact => Self::GenitalContact,
            FfiIntercourseKind::Intercourse => Self::Intercourse,
            FfiIntercourseKind::Withdrawal => Self::Withdrawal,
        }
    }
}

impl From<FfiLhQualitative> for LhQualitative {
    fn from(value: FfiLhQualitative) -> Self {
        match value {
            FfiLhQualitative::Negative => Self::Negative,
            FfiLhQualitative::Positive => Self::Positive,
            FfiLhQualitative::Invalid => Self::Invalid,
            FfiLhQualitative::Indeterminate => Self::Indeterminate,
        }
    }
}

impl From<FfiMucusSensation> for MucusSensation {
    fn from(value: FfiMucusSensation) -> Self {
        match value {
            FfiMucusSensation::Dry => Self::Dry,
            FfiMucusSensation::Damp => Self::Damp,
            FfiMucusSensation::Wet => Self::Wet,
            FfiMucusSensation::Slippery => Self::Slippery,
            FfiMucusSensation::Other => Self::Other,
        }
    }
}

impl From<FfiMucusAppearance> for MucusAppearance {
    fn from(value: FfiMucusAppearance) -> Self {
        match value {
            FfiMucusAppearance::None => Self::None,
            FfiMucusAppearance::Tacky => Self::Tacky,
            FfiMucusAppearance::Creamy => Self::Creamy,
            FfiMucusAppearance::Watery => Self::Watery,
            FfiMucusAppearance::Clear => Self::Clear,
            FfiMucusAppearance::Stretchy => Self::Stretchy,
            FfiMucusAppearance::Other => Self::Other,
        }
    }
}

impl From<FfiMucusCategory> for MucusCategory {
    fn from(value: FfiMucusCategory) -> Self {
        match value {
            FfiMucusCategory::Low => Self::Low,
            FfiMucusCategory::High => Self::High,
            FfiMucusCategory::Peak => Self::Peak,
        }
    }
}

impl From<FfiTemperatureUnit> for TemperatureUnit {
    fn from(value: FfiTemperatureUnit) -> Self {
        match value {
            FfiTemperatureUnit::Celsius => Self::Celsius,
            FfiTemperatureUnit::Fahrenheit => Self::Fahrenheit,
        }
    }
}

impl From<FfiPeakSource> for PeakSource {
    fn from(value: FfiPeakSource) -> Self {
        match value {
            FfiPeakSource::Monitor => Self::Monitor,
            FfiPeakSource::Mucus => Self::Mucus,
            FfiPeakSource::LhStrip => Self::LhStrip,
            FfiPeakSource::Other => Self::Other,
        }
    }
}

impl From<FfiEditableMarker> for MarkerType {
    fn from(value: FfiEditableMarker) -> Self {
        match value {
            FfiEditableMarker::CycleStart => Self::CycleStart,
            FfiEditableMarker::MonitorSetup => Self::MonitorSetup,
            FfiEditableMarker::Monitor => Self::Monitor,
            FfiEditableMarker::QuantitativeHormones => Self::QuantitativeHormones,
            FfiEditableMarker::LhStrip => Self::LhStrip,
            FfiEditableMarker::Bleeding => Self::Bleeding,
            FfiEditableMarker::Intercourse => Self::Intercourse,
            FfiEditableMarker::Mucus => Self::Mucus,
            FfiEditableMarker::Temperature => Self::Temperature,
            FfiEditableMarker::Note => Self::Note,
            FfiEditableMarker::UserMarkedPeak => Self::UserMarkedPeak,
        }
    }
}

fn parse_date(date: &str) -> Result<NaiveDate, LocalRepositoryError> {
    NaiveDate::parse_from_str(date, "%Y-%m-%d").map_err(|_| LocalRepositoryError::InvalidDate)
}

fn parse_time(time: &str) -> Result<NaiveTime, LocalRepositoryError> {
    NaiveTime::parse_from_str(time, "%H:%M")
        .or_else(|_| NaiveTime::parse_from_str(time, "%H:%M:%S"))
        .map_err(|_| LocalRepositoryError::InvalidTime)
}

fn parse_optional_time(time: Option<String>) -> Result<Option<NaiveTime>, LocalRepositoryError> {
    time.map(|value| parse_time(value.trim())).transpose()
}

fn trimmed_optional(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn invite_context(invite_id: Uuid, dataset_id: Uuid) -> Vec<u8> {
    let mut context = b"couple/invite-wrap/v1".to_vec();
    context.extend_from_slice(invite_id.as_bytes());
    context.extend_from_slice(dataset_id.as_bytes());
    context
}

fn invite_verifier(invite_id: Uuid, secret: &SecretKey) -> [u8; 32] {
    let mut digest = Sha256::new();
    digest.update(b"verelle/couple-invite-verifier/v1");
    digest.update(invite_id.as_bytes());
    digest.update(secret.expose());
    digest.finalize().into()
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
        ObservationValue::MonitorSetup { m_button_time, .. } => {
            let window = value
                .testing_window()
                .expect("monitor setup has a testing window");
            format!(
                "Monitor setup: m-button {m_button_time}; recorded window {} to {}",
                time_with_offset(window.start, window.start_day_offset),
                time_with_offset(window.end, window.end_day_offset),
            )
        }
        ObservationValue::Monitor { reading, .. } => {
            format!("Monitor: {}", monitor_reading_label(*reading))
        }
        ObservationValue::QuantitativeHormones { e3g, lh, .. } => {
            format_optional_pair("E3G", *e3g, "LH", *lh)
        }
        ObservationValue::LhStrip {
            qualitative,
            tc_ratio,
            ..
        } => match tc_ratio {
            Some(ratio) => format!("LH strip: {qualitative:?}; T/C {ratio}"),
            None => format!("LH strip: {qualitative:?}"),
        },
        ObservationValue::Bleeding { intensity } => format!("Bleeding: {intensity:?}"),
        ObservationValue::Intercourse { kind, protected } => match protected {
            Some(true) => format!("{kind:?}: protected"),
            Some(false) => format!("{kind:?}: unprotected"),
            None => format!("{kind:?}"),
        },
        ObservationValue::Mucus {
            sensation,
            appearance,
            category,
            ..
        } => format!(
            "Mucus: sensation {}; appearance {}; recorded category {}",
            optional_debug(*sensation),
            optional_debug(*appearance),
            optional_debug(*category),
        ),
        ObservationValue::Temperature { value, unit, .. } => {
            let suffix = match unit {
                TemperatureUnit::Celsius => "°C",
                TemperatureUnit::Fahrenheit => "°F",
            };
            format!("Temperature: {value}{suffix}")
        }
        ObservationValue::Note { text } => format!("Note: {text}"),
        ObservationValue::UserMarkedPeak { source } => {
            format!("User-marked P anchor: {source:?}")
        }
    }
}

fn optional_debug<T: std::fmt::Debug>(value: Option<T>) -> String {
    value.map_or_else(|| "not recorded".to_owned(), |value| format!("{value:?}"))
}

fn format_optional_pair(
    first_label: &str,
    first: Option<f64>,
    second_label: &str,
    second: Option<f64>,
) -> String {
    let mut values = Vec::new();
    if let Some(value) = first {
        values.push(format!("{first_label} {value}"));
    }
    if let Some(value) = second {
        values.push(format!("{second_label} {value}"));
    }
    if values.is_empty() {
        "Quantitative hormones: no value recorded".to_owned()
    } else {
        values.join("; ")
    }
}

fn time_with_offset(time: NaiveTime, day_offset: i64) -> String {
    match day_offset {
        -1 => format!("{time} previous day"),
        0 => time.to_string(),
        1 => format!("{time} next day"),
        value => format!("{time} ({value:+} days)"),
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
    fn pristine_repository_adopts_recovered_dataset_atomically() {
        let file = tempfile::NamedTempFile::new().unwrap();
        let path = file.path().to_string_lossy().into_owned();
        let recovered_dataset_id = Uuid::new_v4();
        let recovered_key = vec![23_u8; 32];
        let repository =
            LocalRepository::open(path.clone(), vec![22_u8; 32], "device-a".to_owned()).unwrap();

        repository
            .adopt_recovered_dataset(recovered_key.clone(), recovered_dataset_id.to_string())
            .unwrap();
        assert_eq!(
            repository.dataset_id().unwrap(),
            recovered_dataset_id.to_string()
        );
        drop(repository);

        let reopened =
            LocalRepository::open(path.clone(), recovered_key, "device-a".to_owned()).unwrap();
        assert_eq!(
            reopened.dataset_id().unwrap(),
            recovered_dataset_id.to_string()
        );
        reopened
            .record_cycle_start("2026-07-20".to_owned(), 1)
            .unwrap();
        assert!(matches!(
            reopened.adopt_recovered_dataset(vec![24_u8; 32], Uuid::new_v4().to_string()),
            Err(LocalRepositoryError::RepositoryNotPristine)
        ));
        drop(reopened);
        assert!(matches!(
            LocalRepository::open(path, vec![24_u8; 32], "device-a".to_owned()),
            Err(LocalRepositoryError::KeyMismatch)
        ));
    }

    #[test]
    #[allow(clippy::too_many_lines)]
    fn native_boundary_records_exports_and_deletes_the_full_v1_vocabulary() {
        let file = tempfile::NamedTempFile::new().unwrap();
        let repository = LocalRepository::open(
            file.path().to_string_lossy().into_owned(),
            vec![42_u8; 32],
            "device-full-vocabulary".to_owned(),
        )
        .unwrap();
        let date = "2026-07-20".to_owned();
        repository
            .record_cycle_start_details(
                date.clone(),
                FfiCycleStartBasis::ReturnToCycles,
                Some(3),
                Some(1),
            )
            .unwrap();
        repository
            .record_monitor_setup(
                date.clone(),
                "07:00".to_owned(),
                Some("Clearblue".to_owned()),
                false,
            )
            .unwrap();
        repository
            .record_monitor_details(
                date.clone(),
                FfiMonitorReading::High,
                true,
                Some("07:15".to_owned()),
                Some(true),
                None,
            )
            .unwrap();
        repository
            .record_quantitative_hormones(
                date.clone(),
                Some(120.4),
                Some(18.2),
                Some("ng/mL".to_owned()),
                Some("mIU/mL".to_owned()),
            )
            .unwrap();
        repository
            .record_lh_strip(
                date.clone(),
                Some("test brand".to_owned()),
                FfiLhQualitative::Positive,
                Some(1.1),
                None,
                true,
                Some("12:30".to_owned()),
            )
            .unwrap();
        repository
            .record_bleeding(date.clone(), FfiBleedingIntensity::Light)
            .unwrap();
        repository
            .record_intercourse(date.clone(), FfiIntercourseKind::Intercourse, Some(false))
            .unwrap();
        repository
            .record_mucus(
                date.clone(),
                Some(FfiMucusSensation::Wet),
                Some(FfiMucusAppearance::Clear),
                Some(FfiMucusCategory::High),
                Some(true),
                Some(80),
            )
            .unwrap();
        repository
            .record_temperature(
                date.clone(),
                36.6,
                FfiTemperatureUnit::Celsius,
                Some("06:45".to_owned()),
                Some(90),
                false,
            )
            .unwrap();
        repository
            .record_note(date.clone(), "recorded note".to_owned())
            .unwrap();
        repository
            .record_user_marked_peak(date.clone(), FfiPeakSource::Other)
            .unwrap();

        let chart = repository.charts().unwrap().pop().unwrap();
        assert_eq!(chart.days[0].entries.len(), 11);
        assert!(
            chart.days[0]
                .entries
                .iter()
                .any(|entry| entry.label.contains("04:00:00 to 10:00:00"))
        );
        assert!(repository.export_json().unwrap().contains("recorded note"));
        assert!(repository.export_csv().unwrap().contains("recorded note"));

        let superseded = repository
            .delete_marker(date.clone(), FfiEditableMarker::Note)
            .unwrap();
        assert_eq!(superseded.len(), 1);
        assert_eq!(
            repository
                .purge_marker_history(date, FfiEditableMarker::Note, superseded)
                .unwrap(),
            1
        );
        assert!(!repository.export_json().unwrap().contains("recorded note"));
    }

    #[test]
    fn couple_invite_shares_only_client_wrapped_key_material() {
        let setup = generate_server_setup();
        let owner_password = b"owner correct horse battery staple";
        let owner_email = "owner@example.com";
        let owner = LocalRepository::open(
            tempfile::NamedTempFile::new()
                .unwrap()
                .path()
                .to_string_lossy()
                .into_owned(),
            vec![51_u8; 32],
            "owner-device".to_owned(),
        )
        .unwrap();
        let owner_registration = opaque_registration_start(owner_password.to_vec()).unwrap();
        let owner_response = server_registration_start(
            &setup,
            &account_credential_identifier(owner_email).unwrap(),
            &owner_registration.request,
        )
        .unwrap();
        owner
            .finish_account_registration(
                owner_registration.state,
                owner_password.to_vec(),
                owner_email.to_owned(),
                owner_response,
            )
            .unwrap();
        let invite = owner.create_couple_invite().unwrap();
        assert!(!invite.invite_code.contains(&invite.verifier_base64url));

        let partner_password = b"partner correct horse battery staple";
        let partner_email = "partner@example.com";
        let partner = LocalRepository::open(
            tempfile::NamedTempFile::new()
                .unwrap()
                .path()
                .to_string_lossy()
                .into_owned(),
            vec![52_u8; 32],
            "partner-device".to_owned(),
        )
        .unwrap();
        let partner_registration = opaque_registration_start(partner_password.to_vec()).unwrap();
        let partner_response = server_registration_start(
            &setup,
            &account_credential_identifier(partner_email).unwrap(),
            &partner_registration.request,
        )
        .unwrap();
        partner
            .finish_account_registration(
                partner_registration.state,
                partner_password.to_vec(),
                partner_email.to_owned(),
                partner_response,
            )
            .unwrap();
        let acceptance = partner
            .prepare_couple_invite_acceptance(invite.invite_code)
            .unwrap();
        assert_eq!(acceptance.recovered_dataset_key, vec![51_u8; 32]);
        assert_eq!(acceptance.dataset_id, owner.dataset_id().unwrap());
        assert!(!acceptance.wrapped_dataset_key.is_empty());
        partner
            .adopt_recovered_dataset(
                acceptance.recovered_dataset_key,
                acceptance.dataset_id.clone(),
            )
            .unwrap();

        owner
            .record_cycle_start("2026-07-20".to_owned(), 1)
            .unwrap();
        let operation = owner.sync_batch(1).unwrap().operations[0].clone();
        partner
            .apply_pull_page(FfiPullPage {
                after_cursor: 0,
                next_cursor: 1,
                operations: vec![FfiSequencedTransportOperation {
                    server_sequence: 1,
                    operation,
                }],
                more: false,
            })
            .unwrap();
        assert_eq!(partner.charts().unwrap().len(), 1);
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
    #[allow(clippy::too_many_lines)] // Full proof reconstruction is one security assertion.
    fn android_recovery_rotates_wraps_and_signs_the_server_proof() {
        let old_password = b"correct horse battery staple";
        let new_password = b"a different correct horse battery staple";
        let email = "founder@example.com";
        let identifier = account_credential_identifier(email).unwrap();
        let setup = generate_server_setup();
        let dataset_key = vec![31_u8; 32];
        let repository = LocalRepository::open(
            tempfile::NamedTempFile::new()
                .unwrap()
                .path()
                .to_string_lossy()
                .into_owned(),
            dataset_key.clone(),
            Uuid::new_v4().to_string(),
        )
        .unwrap();
        let original = opaque_registration_start(old_password.to_vec()).unwrap();
        let original_response =
            server_registration_start(&setup, &identifier, &original.request).unwrap();
        let original_material = repository
            .finish_account_registration(
                original.state,
                old_password.to_vec(),
                email.to_owned(),
                original_response,
            )
            .unwrap();

        let flow_id = Uuid::new_v4();
        let device_id = Uuid::new_v4();
        let dataset_id = Uuid::new_v4();
        let challenge = vec![9_u8; 32];
        let device_public_key = vec![8_u8; 91];
        let recovery = opaque_registration_start(new_password.to_vec()).unwrap();
        let recovery_response =
            server_registration_start(&setup, &identifier, &recovery.request).unwrap();
        assert!(matches!(
            opaque_account_recovery_finish(
                recovery.state.clone(),
                new_password.to_vec(),
                email.to_owned(),
                recovery_response.clone(),
                RecoveryCode::generate().as_str().to_owned(),
                original_material.recovery_wrapped_account_key.clone(),
                original_material.wrapped_dataset_key.clone(),
                flow_id.to_string(),
                device_id.to_string(),
                dataset_id.to_string(),
                challenge.clone(),
                device_public_key.clone(),
            ),
            Err(AccountAuthError::InvalidRecoveryMaterial)
        ));
        let recovered = opaque_account_recovery_finish(
            recovery.state,
            new_password.to_vec(),
            email.to_owned(),
            recovery_response,
            original_material.recovery_code.clone(),
            original_material.recovery_wrapped_account_key.clone(),
            original_material.wrapped_dataset_key.clone(),
            flow_id.to_string(),
            device_id.to_string(),
            dataset_id.to_string(),
            challenge.clone(),
            device_public_key.clone(),
        )
        .unwrap();
        assert_eq!(recovered.recovered_dataset_key, dataset_key);
        assert_ne!(recovered.recovery_code, original_material.recovery_code);
        assert!(server_registration_finish(&recovered.registration_upload).is_ok());

        let original_code = RecoveryCode::parse(original_material.recovery_code).unwrap();
        let original_wrap =
            EncryptedEnvelope::from_bytes(&original_material.recovery_wrapped_account_key).unwrap();
        let account_key = unwrap_secret_key(
            &original_code.wrapping_key().unwrap(),
            LOCAL_KEY_EPOCH,
            b"account/recovery-wrap",
            &original_wrap,
        )
        .unwrap();
        let request = RecoveryFinishRequest {
            flow_id,
            device_id,
            dataset_id,
            registration_upload: OpaqueMessage::from_bytes(&recovered.registration_upload),
            device_public_key: OpaqueMessage::from_bytes(&device_public_key),
            device_signature: OpaqueMessage::from_bytes(&[1]),
            recovery_signature: OpaqueMessage::from_bytes(&recovered.recovery_signature),
            wrapped_account_key: OpaqueMessage::from_bytes(&recovered.wrapped_account_key),
            recovery_wrapped_account_key: OpaqueMessage::from_bytes(
                &recovered.recovery_wrapped_account_key,
            ),
            wrapped_dataset_key: OpaqueMessage::from_bytes(&recovered.wrapped_dataset_key),
        };
        let expected_proof = recovery_account_proof_message(&request, &challenge);
        assert_eq!(
            recovered.recovery_signature,
            sign_recovery_message(&account_key, &expected_proof).unwrap()
        );

        let replacement_code = RecoveryCode::parse(recovered.recovery_code).unwrap();
        let replacement_wrap =
            EncryptedEnvelope::from_bytes(&recovered.recovery_wrapped_account_key).unwrap();
        let replacement_account_key = unwrap_secret_key(
            &replacement_code.wrapping_key().unwrap(),
            LOCAL_KEY_EPOCH,
            b"account/recovery-wrap",
            &replacement_wrap,
        )
        .unwrap();
        assert_eq!(replacement_account_key.expose(), account_key.expose());
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

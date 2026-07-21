use chrono::{Duration, NaiveDate, NaiveTime};
use serde::{Deserialize, Serialize};
use std::fmt;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum DomainError {
    #[error("{field} must be finite")]
    NonFiniteNumber { field: &'static str },
    #[error("{field} must not be negative")]
    NegativeNumber { field: &'static str },
    #[error("{field} must be between 0 and 100")]
    PercentageOutOfRange { field: &'static str },
    #[error("cycle numbers start at one")]
    ZeroCycleNumber,
    #[error("recorded_by must not be blank")]
    BlankRecordedBy,
    #[error("version device_id must not be blank")]
    BlankDeviceId,
}

/// A deterministic last-writer-wins stamp. Device ID is the documented
/// tiebreaker when two hybrid clocks have the same value.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, PartialOrd, Ord)]
pub struct VersionStamp {
    pub physical_ms: i64,
    pub logical: u32,
    pub device_id: String,
}

impl VersionStamp {
    pub fn new(physical_ms: i64, logical: u32, device_id: impl Into<String>) -> Self {
        Self {
            physical_ms,
            logical,
            device_id: device_id.into(),
        }
    }

    pub fn validate(&self) -> Result<(), DomainError> {
        if self.device_id.trim().is_empty() {
            return Err(DomainError::BlankDeviceId);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum MarkerType {
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

impl fmt::Display for MarkerType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let value = serde_json::to_value(self).map_err(|_| fmt::Error)?;
        f.write_str(value.as_str().ok_or(fmt::Error)?)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, PartialOrd, Ord)]
pub struct RecordKey {
    pub date: NaiveDate,
    pub marker: MarkerType,
}

impl fmt::Display for RecordKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}:{}", self.date, self.marker)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MonitorReading {
    Low,
    High,
    Peak,
    Missed,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LhQualitative {
    Negative,
    Positive,
    Invalid,
    Indeterminate,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BleedingIntensity {
    Spotting,
    Light,
    Moderate,
    Heavy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IntercourseKind {
    GenitalContact,
    Intercourse,
    Withdrawal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MucusSensation {
    Dry,
    Damp,
    Wet,
    Slippery,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MucusAppearance {
    None,
    Tacky,
    Creamy,
    Watery,
    Clear,
    Stretchy,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MucusCategory {
    Low,
    High,
    Peak,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TemperatureUnit {
    Celsius,
    Fahrenheit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CycleStartBasis {
    Menses,
    ArtificialPostpartum,
    ReturnToCycles,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PeakSource {
    Monitor,
    Mucus,
    LhStrip,
    Other,
}

/// The full vocabulary accepted by the v1 record-and-display product.
/// No variant represents a computed day classification.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ObservationValue {
    CycleStart {
        cycle_id: Uuid,
        basis: CycleStartBasis,
        method_cycle_number: Option<u32>,
        postpartum_cycle_number: Option<u32>,
    },
    MonitorSetup {
        m_button_time: NaiveTime,
        monitor_model: Option<String>,
        memory_reset: bool,
        artificial_cycle_id: Option<Uuid>,
    },
    Monitor {
        reading: MonitorReading,
        test_requested: bool,
        test_time: Option<NaiveTime>,
        first_morning_urine: Option<bool>,
        error_code: Option<String>,
    },
    QuantitativeHormones {
        e3g: Option<f64>,
        lh: Option<f64>,
        e3g_unit: Option<String>,
        lh_unit: Option<String>,
    },
    LhStrip {
        brand: Option<String>,
        qualitative: LhQualitative,
        tc_ratio: Option<f64>,
        numeric_lh: Option<f64>,
        valid: bool,
        test_time: Option<NaiveTime>,
    },
    Bleeding {
        intensity: BleedingIntensity,
    },
    Intercourse {
        kind: IntercourseKind,
        protected: Option<bool>,
    },
    Mucus {
        sensation: Option<MucusSensation>,
        appearance: Option<MucusAppearance>,
        category: Option<MucusCategory>,
        baseline_change: Option<bool>,
        confidence: Option<u8>,
    },
    Temperature {
        value: f64,
        unit: TemperatureUnit,
        time: Option<NaiveTime>,
        sleep_quality: Option<u8>,
        disturbed: bool,
    },
    Note {
        text: String,
    },
    UserMarkedPeak {
        source: PeakSource,
    },
}

impl ObservationValue {
    pub const fn marker_type(&self) -> MarkerType {
        match self {
            Self::CycleStart { .. } => MarkerType::CycleStart,
            Self::MonitorSetup { .. } => MarkerType::MonitorSetup,
            Self::Monitor { .. } => MarkerType::Monitor,
            Self::QuantitativeHormones { .. } => MarkerType::QuantitativeHormones,
            Self::LhStrip { .. } => MarkerType::LhStrip,
            Self::Bleeding { .. } => MarkerType::Bleeding,
            Self::Intercourse { .. } => MarkerType::Intercourse,
            Self::Mucus { .. } => MarkerType::Mucus,
            Self::Temperature { .. } => MarkerType::Temperature,
            Self::Note { .. } => MarkerType::Note,
            Self::UserMarkedPeak { .. } => MarkerType::UserMarkedPeak,
        }
    }

    pub fn testing_window(&self) -> Option<TestingWindow> {
        let Self::MonitorSetup { m_button_time, .. } = self else {
            return None;
        };
        let (start, start_overflow_seconds) =
            m_button_time.overflowing_add_signed(Duration::hours(-3));
        let (end, end_overflow_seconds) = m_button_time.overflowing_add_signed(Duration::hours(3));
        Some(TestingWindow {
            start,
            end,
            start_day_offset: start_overflow_seconds / 86_400,
            end_day_offset: end_overflow_seconds / 86_400,
        })
    }

    /// Validate data-integrity constraints that are independent of any
    /// fertility protocol or interpretation.
    pub fn validate(&self) -> Result<(), DomainError> {
        match self {
            Self::CycleStart {
                method_cycle_number,
                postpartum_cycle_number,
                ..
            } => {
                if method_cycle_number == &Some(0) || postpartum_cycle_number == &Some(0) {
                    return Err(DomainError::ZeroCycleNumber);
                }
            }
            Self::QuantitativeHormones { e3g, lh, .. } => {
                validate_optional_non_negative(*e3g, "e3g")?;
                validate_optional_non_negative(*lh, "lh")?;
            }
            Self::LhStrip {
                tc_ratio,
                numeric_lh,
                ..
            } => {
                validate_optional_non_negative(*tc_ratio, "tc_ratio")?;
                validate_optional_non_negative(*numeric_lh, "numeric_lh")?;
            }
            Self::Mucus {
                confidence: Some(confidence),
                ..
            } if *confidence > 100 => {
                return Err(DomainError::PercentageOutOfRange {
                    field: "mucus confidence",
                });
            }
            Self::Temperature {
                value,
                sleep_quality,
                ..
            } => {
                validate_finite(*value, "temperature")?;
                if sleep_quality.is_some_and(|quality| quality > 100) {
                    return Err(DomainError::PercentageOutOfRange {
                        field: "sleep quality",
                    });
                }
            }
            _ => {}
        }
        Ok(())
    }
}

fn validate_optional_non_negative(
    value: Option<f64>,
    field: &'static str,
) -> Result<(), DomainError> {
    if let Some(value) = value {
        validate_finite(value, field)?;
        if value < 0.0 {
            return Err(DomainError::NegativeNumber { field });
        }
    }
    Ok(())
}

fn validate_finite(value: f64, field: &'static str) -> Result<(), DomainError> {
    if !value.is_finite() {
        return Err(DomainError::NonFiniteNumber { field });
    }
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct TestingWindow {
    pub start: NaiveTime,
    pub end: NaiveTime,
    /// Relative to the civil date containing the m-button time.
    pub start_day_offset: i64,
    /// Relative to the civil date containing the m-button time.
    pub end_day_offset: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Observation {
    pub id: Uuid,
    pub date: NaiveDate,
    pub value: ObservationValue,
    pub recorded_by: String,
    pub version: VersionStamp,
}

impl Observation {
    pub fn record_key(&self) -> RecordKey {
        RecordKey {
            date: self.date,
            marker: self.value.marker_type(),
        }
    }

    pub fn validate(&self) -> Result<(), DomainError> {
        if self.recorded_by.trim().is_empty() {
            return Err(DomainError::BlankRecordedBy);
        }
        self.version.validate()?;
        self.value.validate()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derives_testing_window_without_losing_day_boundaries() {
        let setup = ObservationValue::MonitorSetup {
            m_button_time: NaiveTime::from_hms_opt(2, 0, 0).unwrap(),
            monitor_model: None,
            memory_reset: false,
            artificial_cycle_id: None,
        };
        let window = setup.testing_window().unwrap();
        assert_eq!(window.start, NaiveTime::from_hms_opt(23, 0, 0).unwrap());
        assert_eq!(window.start_day_offset, -1);
        assert_eq!(window.end, NaiveTime::from_hms_opt(5, 0, 0).unwrap());
        assert_eq!(window.end_day_offset, 0);
    }

    #[test]
    fn rejects_only_structural_numeric_errors_without_interpreting_values() {
        let negative_hormone = ObservationValue::QuantitativeHormones {
            e3g: Some(-1.0),
            lh: None,
            e3g_unit: None,
            lh_unit: None,
        };
        assert_eq!(
            negative_hormone.validate(),
            Err(DomainError::NegativeNumber { field: "e3g" })
        );

        let non_finite_temperature = ObservationValue::Temperature {
            value: f64::NAN,
            unit: TemperatureUnit::Celsius,
            time: None,
            sleep_quality: None,
            disturbed: false,
        };
        assert_eq!(
            non_finite_temperature.validate(),
            Err(DomainError::NonFiniteNumber {
                field: "temperature"
            })
        );

        let out_of_range_quality = ObservationValue::Mucus {
            sensation: None,
            appearance: None,
            category: None,
            baseline_change: None,
            confidence: Some(101),
        };
        assert!(matches!(
            out_of_range_quality.validate(),
            Err(DomainError::PercentageOutOfRange { .. })
        ));
    }
}

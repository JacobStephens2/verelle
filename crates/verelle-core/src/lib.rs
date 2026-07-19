//! Pure, deterministic charting domain for Verelle.
//!
//! This crate deliberately contains no protocol engine and no fertility
//! classification. It records and lays out user-provided facts only.

mod chart;
mod domain;
mod export;
mod fixture;

pub use chart::{CycleChart, DayCell, MechanicalAnnotation, build_charts};
pub use domain::{
    BleedingIntensity, CycleStartBasis, IntercourseKind, LhQualitative, MarkerType, MonitorReading,
    MucusAppearance, MucusCategory, MucusSensation, Observation, ObservationValue, PeakSource,
    RecordKey, TemperatureUnit, TestingWindow, VersionStamp,
};
pub use export::{ExportError, observations_to_csv, observations_to_json};
pub use fixture::{ExpectedChart, ExpectedDay, GoldenFixture};

//! Typed native boundary for platform shells.
//!
//! This first surface is deliberately narrow: it proves that a native client
//! can replay the same fixture and receive the same compact chart structure as
//! Rust. It exposes no protocol interpretation or computed fertility status.

use thiserror::Error;
use verelle_core::{ExpectedChart, GoldenFixture, build_charts};

uniffi::setup_scaffolding!();

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct FfiChartDay {
    pub date: String,
    pub cycle_day: u32,
    pub markers: Vec<String>,
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

impl From<ExpectedChart> for FfiChart {
    fn from(chart: ExpectedChart) -> Self {
        Self {
            start_date: chart.start_date.to_string(),
            basis: serde_json::to_value(chart.basis)
                .expect("cycle-start basis must serialize")
                .as_str()
                .expect("cycle-start basis must serialize as a string")
                .to_owned(),
            method_cycle_number: chart.method_cycle_number,
            postpartum_cycle_number: chart.postpartum_cycle_number,
            days: chart
                .days
                .into_iter()
                .map(|day| FfiChartDay {
                    date: day.date.to_string(),
                    cycle_day: day.cycle_day,
                    markers: day
                        .markers
                        .into_iter()
                        .map(|marker| marker.to_string())
                        .collect(),
                    annotations: day.annotations,
                })
                .collect(),
        }
    }
}

#[uniffi::export]
#[allow(clippy::needless_pass_by_value)] // UniFFI owns lifted String arguments.
pub fn replay_fixture(fixture_json: String) -> Result<Vec<FfiChart>, FixtureReplayError> {
    let fixture: GoldenFixture =
        serde_json::from_str(&fixture_json).map_err(|_| FixtureReplayError::InvalidJson)?;
    Ok(build_charts(&fixture.observations)
        .into_iter()
        .map(ExpectedChart::from)
        .map(FfiChart::from)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixture_replay_matches_the_compact_rust_chart() {
        let fixture_json = include_str!("../../../fixtures/regular-cycle.json");
        let fixture: GoldenFixture = serde_json::from_str(fixture_json).unwrap();

        let charts = replay_fixture(fixture_json.to_owned()).unwrap();
        let expected: Vec<FfiChart> = fixture.expected.into_iter().map(FfiChart::from).collect();

        assert_eq!(charts, expected);
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
}

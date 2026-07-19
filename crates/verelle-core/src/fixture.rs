use crate::{CycleChart, CycleStartBasis, MarkerType, Observation};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GoldenFixture {
    pub name: String,
    pub observations: Vec<Observation>,
    pub expected: Vec<ExpectedChart>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExpectedChart {
    pub start_date: NaiveDate,
    pub basis: CycleStartBasis,
    pub method_cycle_number: u32,
    pub postpartum_cycle_number: Option<u32>,
    pub days: Vec<ExpectedDay>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExpectedDay {
    pub date: NaiveDate,
    pub cycle_day: u32,
    #[serde(default)]
    pub markers: Vec<MarkerType>,
    #[serde(default)]
    pub annotations: Vec<String>,
}

impl From<CycleChart> for ExpectedChart {
    fn from(chart: CycleChart) -> Self {
        Self {
            start_date: chart.start_date,
            basis: chart.basis,
            method_cycle_number: chart.method_cycle_number,
            postpartum_cycle_number: chart.postpartum_cycle_number,
            days: chart
                .days
                .into_iter()
                .map(|day| ExpectedDay {
                    date: day.date,
                    cycle_day: day.cycle_day,
                    markers: day
                        .observations
                        .iter()
                        .map(|item| item.value.marker_type())
                        .collect(),
                    annotations: day
                        .annotations
                        .iter()
                        .map(crate::MechanicalAnnotation::label)
                        .collect(),
                })
                .collect(),
        }
    }
}

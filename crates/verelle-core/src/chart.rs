use crate::{CycleStartBasis, MarkerType, Observation, ObservationValue};
use chrono::{Days, NaiveDate};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MechanicalAnnotation {
    UserMarkedPeak { anchor_date: NaiveDate },
    PostPeakCount { anchor_date: NaiveDate, count: u8 },
}

impl MechanicalAnnotation {
    pub fn label(&self) -> String {
        match self {
            Self::UserMarkedPeak { .. } => "P".to_owned(),
            Self::PostPeakCount { count, .. } => format!("P+{count}"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DayCell {
    pub date: NaiveDate,
    pub cycle_day: u32,
    pub observations: Vec<Observation>,
    pub annotations: Vec<MechanicalAnnotation>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CycleChart {
    pub cycle_id: Uuid,
    pub start_date: NaiveDate,
    pub basis: CycleStartBasis,
    pub method_cycle_number: u32,
    pub postpartum_cycle_number: Option<u32>,
    pub days: Vec<DayCell>,
}

#[derive(Debug, Clone)]
struct Start {
    cycle_id: Uuid,
    date: NaiveDate,
    basis: CycleStartBasis,
    method_cycle_number: Option<u32>,
    postpartum_cycle_number: Option<u32>,
}

/// Lay out all cycles represented by user-marked cycle starts.
///
/// A cycle extends to the day before the next user-marked start. The last
/// cycle extends only through the last recorded date, keeping output stable
/// and independent of the wall clock.
pub fn build_charts(observations: &[Observation]) -> Vec<CycleChart> {
    let mut starts: Vec<Start> = observations
        .iter()
        .filter_map(|observation| {
            let ObservationValue::CycleStart {
                cycle_id,
                basis,
                method_cycle_number,
                postpartum_cycle_number,
            } = &observation.value
            else {
                return None;
            };
            Some(Start {
                cycle_id: *cycle_id,
                date: observation.date,
                basis: *basis,
                method_cycle_number: *method_cycle_number,
                postpartum_cycle_number: *postpartum_cycle_number,
            })
        })
        .collect();
    starts.sort_by_key(|start| (start.date, start.cycle_id));

    let Some(last_observed_date) = observations.iter().map(|item| item.date).max() else {
        return Vec::new();
    };

    starts
        .iter()
        .enumerate()
        .filter_map(|(index, start)| {
            let end_date = starts
                .get(index + 1)
                .and_then(|next| next.date.checked_sub_days(Days::new(1)))
                .unwrap_or(last_observed_date);
            (end_date >= start.date).then(|| {
                build_cycle(
                    start,
                    end_date,
                    observations,
                    u32::try_from(index + 1).unwrap_or(u32::MAX),
                )
            })
        })
        .collect()
}

fn build_cycle(
    start: &Start,
    end_date: NaiveDate,
    observations: &[Observation],
    fallback_method_number: u32,
) -> CycleChart {
    let mut peak_dates: Vec<NaiveDate> = observations
        .iter()
        .filter(|item| {
            item.date >= start.date
                && item.date <= end_date
                && item.value.marker_type() == MarkerType::UserMarkedPeak
        })
        .map(|item| item.date)
        .collect();
    peak_dates.sort_unstable();
    peak_dates.dedup();

    let day_count = u32::try_from((end_date - start.date).num_days())
        .unwrap_or(u32::MAX)
        .saturating_add(1);
    let mut days = Vec::with_capacity(day_count as usize);
    for day_offset in 0..day_count {
        let date = start
            .date
            .checked_add_days(Days::new(u64::from(day_offset)))
            .expect("cycle date must remain representable");
        let mut day_observations: Vec<Observation> = observations
            .iter()
            .filter(|item| item.date == date)
            .cloned()
            .collect();
        day_observations.sort_by_key(|item| (item.value.marker_type(), item.id));

        let mut annotations = Vec::new();
        for anchor_date in &peak_dates {
            let offset = (date - *anchor_date).num_days();
            match offset {
                0 => annotations.push(MechanicalAnnotation::UserMarkedPeak {
                    anchor_date: *anchor_date,
                }),
                1..=3 => annotations.push(MechanicalAnnotation::PostPeakCount {
                    anchor_date: *anchor_date,
                    count: u8::try_from(offset).expect("offset is bounded to three"),
                }),
                _ => {}
            }
        }
        days.push(DayCell {
            date,
            cycle_day: day_offset + 1,
            observations: day_observations,
            annotations,
        });
    }

    CycleChart {
        cycle_id: start.cycle_id,
        start_date: start.date,
        basis: start.basis,
        method_cycle_number: start.method_cycle_number.unwrap_or(fallback_method_number),
        postpartum_cycle_number: start.postpartum_cycle_number,
        days,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{PeakSource, VersionStamp};
    use proptest::prelude::*;

    fn observation(date: NaiveDate, value: ObservationValue) -> Observation {
        Observation {
            id: Uuid::new_v4(),
            date,
            value,
            recorded_by: "device-a".to_owned(),
            version: VersionStamp::new(1, 0, "device-a"),
        }
    }

    proptest! {
        #[test]
        fn day_numbering_is_total_and_stable(offsets in prop::collection::vec(0_u16..730, 0..200)) {
            let start_date = NaiveDate::from_ymd_opt(2025, 1, 1).unwrap();
            let mut input = vec![observation(start_date, ObservationValue::CycleStart {
                cycle_id: Uuid::nil(),
                basis: CycleStartBasis::Menses,
                method_cycle_number: None,
                postpartum_cycle_number: None,
            })];
            input.extend(offsets.iter().map(|offset| observation(
                start_date.checked_add_days(Days::new(u64::from(*offset))).unwrap(),
                ObservationValue::Note { text: offset.to_string() },
            )));
            let chart_a = build_charts(&input);
            input.reverse();
            let chart_b = build_charts(&input);
            prop_assert_eq!(&chart_a, &chart_b);
            let days = &chart_a[0].days;
            prop_assert!(days.iter().enumerate().all(|(index, day)| day.cycle_day == u32::try_from(index + 1).unwrap()));
        }

        #[test]
        fn arbitrary_record_and_display_sequences_do_not_panic(
            items in prop::collection::vec((0_u16..730, 0_u8..4), 0..300)
        ) {
            let origin = NaiveDate::from_ymd_opt(2025, 1, 1).unwrap();
            let input: Vec<Observation> = items
                .into_iter()
                .enumerate()
                .map(|(index, (offset, kind))| {
                    let date = origin.checked_add_days(Days::new(u64::from(offset))).unwrap();
                    let value = match kind {
                        0 => ObservationValue::CycleStart {
                            cycle_id: Uuid::from_u128(u128::try_from(index + 1).unwrap()),
                            basis: CycleStartBasis::ArtificialPostpartum,
                            method_cycle_number: None,
                            postpartum_cycle_number: None,
                        },
                        1 => ObservationValue::Monitor {
                            reading: crate::MonitorReading::Error,
                            test_requested: true,
                            test_time: None,
                            first_morning_urine: None,
                            error_code: Some("fixture".to_owned()),
                        },
                        2 => ObservationValue::UserMarkedPeak { source: PeakSource::Other },
                        _ => ObservationValue::Note { text: index.to_string() },
                    };
                    Observation {
                        id: Uuid::from_u128(u128::try_from(index + 10_000).unwrap()),
                        date,
                        value,
                        recorded_by: "property-device".to_owned(),
                        version: VersionStamp::new(i64::try_from(index).unwrap(), 0, "property-device"),
                    }
                })
                .collect();
            let mut reversed = input.clone();
            reversed.reverse();
            prop_assert_eq!(build_charts(&input), build_charts(&reversed));
        }
    }

    #[test]
    fn annotations_only_follow_explicit_anchor() {
        let start = NaiveDate::from_ymd_opt(2025, 1, 1).unwrap();
        let high = observation(
            start.checked_add_days(Days::new(5)).unwrap(),
            ObservationValue::Monitor {
                reading: crate::MonitorReading::Peak,
                test_requested: true,
                test_time: None,
                first_morning_urine: None,
                error_code: None,
            },
        );
        let mut input = vec![
            observation(
                start,
                ObservationValue::CycleStart {
                    cycle_id: Uuid::nil(),
                    basis: CycleStartBasis::Menses,
                    method_cycle_number: None,
                    postpartum_cycle_number: None,
                },
            ),
            high,
        ];
        assert!(
            build_charts(&input)[0]
                .days
                .iter()
                .all(|day| day.annotations.is_empty())
        );
        input.push(observation(
            start.checked_add_days(Days::new(5)).unwrap(),
            ObservationValue::UserMarkedPeak {
                source: PeakSource::Monitor,
            },
        ));
        input.push(observation(
            start.checked_add_days(Days::new(8)).unwrap(),
            ObservationValue::Note {
                text: "extend chart".to_owned(),
            },
        ));
        let labels: Vec<String> = build_charts(&input)[0]
            .days
            .iter()
            .flat_map(|day| day.annotations.iter().map(MechanicalAnnotation::label))
            .collect();
        assert_eq!(labels, ["P", "P+1", "P+2", "P+3"]);
    }
}

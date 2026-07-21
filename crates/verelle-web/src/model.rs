use verelle_core::{MonitorReading, Observation, ObservationValue};

/// Materialize the newest local value for the record key used by the v1 UI.
pub fn upsert_observation(observations: &mut Vec<Observation>, incoming: Observation) {
    let incoming_key = incoming.record_key();
    observations.retain(|existing| existing.record_key() != incoming_key);
    observations.push(incoming);
    observations.sort_by_key(|observation| (observation.date, observation.value.marker_type()));
}

pub fn observation_label(value: &ObservationValue) -> String {
    match value {
        ObservationValue::CycleStart { .. } => "Cycle start".to_owned(),
        ObservationValue::Monitor { reading, .. } => {
            format!("Monitor · {}", monitor_reading_label(*reading))
        }
        ObservationValue::UserMarkedPeak { .. } => "P anchor".to_owned(),
        _ => value.marker_type().to_string().replace('_', " "),
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

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;
    use uuid::Uuid;
    use verelle_core::{ObservationValue, VersionStamp};

    fn monitor(reading: MonitorReading, version: i64) -> Observation {
        Observation {
            id: Uuid::new_v4(),
            date: NaiveDate::from_ymd_opt(2026, 7, 19).unwrap(),
            value: ObservationValue::Monitor {
                reading,
                test_requested: true,
                test_time: None,
                first_morning_urine: None,
                error_code: None,
            },
            recorded_by: "web-test".to_owned(),
            version: VersionStamp::new(version, 0, "web-test"),
        }
    }

    #[test]
    fn local_recording_replaces_the_same_date_and_marker() {
        let mut observations = vec![monitor(MonitorReading::Low, 1)];
        upsert_observation(&mut observations, monitor(MonitorReading::Peak, 2));

        assert_eq!(observations.len(), 1);
        assert_eq!(observation_label(&observations[0].value), "Monitor · Peak");
    }
}

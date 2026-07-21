use crate::{DomainError, Observation};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ExportError {
    #[error("observation is invalid: {0}")]
    Domain(#[from] DomainError),
    #[error("could not serialize JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("could not serialize CSV: {0}")]
    Csv(#[from] csv::Error),
    #[error("could not finish CSV output: {0}")]
    Io(#[from] std::io::Error),
    #[error("CSV output was not UTF-8: {0}")]
    Utf8(#[from] std::string::FromUtf8Error),
}

pub fn observations_to_json(observations: &[Observation]) -> Result<String, ExportError> {
    validate_observations(observations)?;
    Ok(serde_json::to_string_pretty(observations)?)
}

pub fn observations_to_csv(observations: &[Observation]) -> Result<String, ExportError> {
    validate_observations(observations)?;
    let mut writer = csv::Writer::from_writer(Vec::new());
    writer.write_record([
        "id",
        "date",
        "marker_type",
        "value_json",
        "recorded_by",
        "physical_ms",
        "logical",
        "device_id",
    ])?;
    for observation in observations {
        writer.write_record([
            observation.id.to_string(),
            observation.date.to_string(),
            observation.value.marker_type().to_string(),
            serde_json::to_string(&observation.value)?,
            observation.recorded_by.clone(),
            observation.version.physical_ms.to_string(),
            observation.version.logical.to_string(),
            observation.version.device_id.clone(),
        ])?;
    }
    let bytes = writer
        .into_inner()
        .map_err(csv::IntoInnerError::into_error)?;
    Ok(String::from_utf8(bytes)?)
}

fn validate_observations(observations: &[Observation]) -> Result<(), DomainError> {
    observations.iter().try_for_each(Observation::validate)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ObservationValue, TemperatureUnit, VersionStamp};
    use chrono::NaiveDate;
    use uuid::Uuid;

    fn temperature(value: f64) -> Observation {
        Observation {
            id: Uuid::nil(),
            date: NaiveDate::from_ymd_opt(2026, 7, 20).unwrap(),
            value: ObservationValue::Temperature {
                value,
                unit: TemperatureUnit::Celsius,
                time: None,
                sleep_quality: Some(90),
                disturbed: false,
            },
            recorded_by: "fixture-device".to_owned(),
            version: VersionStamp::new(1, 0, "fixture-device"),
        }
    }

    #[test]
    fn json_and_csv_exports_preserve_recorded_values() {
        let observation = temperature(36.55);
        let json = observations_to_json(std::slice::from_ref(&observation)).unwrap();
        assert_eq!(
            serde_json::from_str::<Vec<Observation>>(&json).unwrap(),
            vec![observation.clone()]
        );
        let csv = observations_to_csv(std::slice::from_ref(&observation)).unwrap();
        assert!(csv.contains("temperature"));
        assert!(csv.contains("36.55"));
    }

    #[test]
    fn exports_reject_non_finite_values_instead_of_emitting_null() {
        let error = observations_to_json(&[temperature(f64::INFINITY)]).unwrap_err();
        assert!(matches!(
            error,
            ExportError::Domain(DomainError::NonFiniteNumber {
                field: "temperature"
            })
        ));
    }
}

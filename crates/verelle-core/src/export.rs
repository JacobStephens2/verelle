use crate::Observation;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ExportError {
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
    Ok(serde_json::to_string_pretty(observations)?)
}

pub fn observations_to_csv(observations: &[Observation]) -> Result<String, ExportError> {
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

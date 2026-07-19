use serde::{Serialize, de::DeserializeOwned};
use wasm_bindgen::{JsCast, JsValue};
use wasm_bindgen_futures::JsFuture;
use web_sys::{Request, RequestInit, RequestMode, Response, window};

use verelle_api::{PullResponse, PushRequest, PushResponse, dataset_operations_path};

pub async fn push(
    dataset_id: uuid::Uuid,
    bearer_token: &str,
    request: &PushRequest,
) -> Result<PushResponse, String> {
    request_json(
        "POST",
        &dataset_operations_path(dataset_id),
        bearer_token,
        Some(request),
    )
    .await
}

pub async fn pull(
    dataset_id: uuid::Uuid,
    bearer_token: &str,
    after: u64,
) -> Result<PullResponse, String> {
    request_json::<PushRequest, PullResponse>(
        "GET",
        &format!(
            "{}?after={after}&limit={}",
            dataset_operations_path(dataset_id),
            verelle_api::MAX_PUSH_OPERATIONS
        ),
        bearer_token,
        None,
    )
    .await
}

async fn request_json<B, R>(
    method: &str,
    path: &str,
    bearer_token: &str,
    body: Option<&B>,
) -> Result<R, String>
where
    B: Serialize,
    R: DeserializeOwned,
{
    let options = RequestInit::new();
    options.set_method(method);
    options.set_mode(RequestMode::SameOrigin);
    let body_json = body
        .map(serde_json::to_string)
        .transpose()
        .map_err(|_| "Sync request could not be encoded".to_owned())?;
    if let Some(body_json) = &body_json {
        options.set_body(&JsValue::from_str(body_json));
    }
    let request = Request::new_with_str_and_init(path, &options)
        .map_err(|_| "Sync request could not be created".to_owned())?;
    request
        .headers()
        .set("Authorization", &format!("Bearer {bearer_token}"))
        .and_then(|()| request.headers().set("Accept", "application/json"))
        .map_err(|_| "Sync request headers could not be set".to_owned())?;
    if body_json.is_some() {
        request
            .headers()
            .set("Content-Type", "application/json")
            .map_err(|_| "Sync content type could not be set".to_owned())?;
    }
    let response = JsFuture::from(
        window()
            .ok_or_else(|| "Browser window is unavailable".to_owned())?
            .fetch_with_request(&request),
    )
    .await
    .map_err(|_| "Sync request failed".to_owned())?
    .dyn_into::<Response>()
    .map_err(|_| "Sync response is invalid".to_owned())?;
    let status = response.status();
    let text = JsFuture::from(
        response
            .text()
            .map_err(|_| "Sync response body is unavailable".to_owned())?,
    )
    .await
    .map_err(|_| "Sync response body could not be read".to_owned())?
    .as_string()
    .ok_or_else(|| "Sync response is not text".to_owned())?;
    if !(200..300).contains(&status) {
        return Err(format!("Sync request returned HTTP {status}"));
    }
    serde_json::from_str(&text).map_err(|_| "Sync response could not be decoded".to_owned())
}

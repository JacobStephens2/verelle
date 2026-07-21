use serde::{Serialize, de::DeserializeOwned};
use wasm_bindgen::{JsCast, JsValue};
use wasm_bindgen_futures::JsFuture;
use web_sys::{Request, RequestInit, RequestMode, Response, window};

use verelle_api::{
    AccountDeletionResponse, CheckoutSessionRequest, CheckoutSessionResponse,
    CoupleInviteCreateRequest, CoupleInviteCreateResponse, CoupleInviteRedeemRequest,
    CoupleInviteRedeemResponse, EntitlementResponse, LoginFinishRequest, LoginFinishResponse,
    LoginStartRequest, LoginStartResponse, RecoveryFinishRequest, RecoveryFinishResponse,
    RecoveryStartRequest, RecoveryStartResponse, RedactOperationsRequest, RedactOperationsResponse,
    RegistrationFinishRequest, RegistrationFinishResponse, RegistrationStartRequest,
    RegistrationStartResponse,
};

const MAX_RESPONSE_CHARS: usize = 1_500_000;

pub async fn registration_start(
    request: &RegistrationStartRequest,
) -> Result<RegistrationStartResponse, String> {
    request_json(
        "POST",
        verelle_api::REGISTRATION_START_PATH,
        None,
        Some(request),
    )
    .await
}

pub async fn registration_finish(
    request: &RegistrationFinishRequest,
) -> Result<RegistrationFinishResponse, String> {
    request_json(
        "POST",
        verelle_api::REGISTRATION_FINISH_PATH,
        None,
        Some(request),
    )
    .await
}

pub async fn login_start(request: &LoginStartRequest) -> Result<LoginStartResponse, String> {
    request_json("POST", verelle_api::LOGIN_START_PATH, None, Some(request)).await
}

pub async fn login_finish(request: &LoginFinishRequest) -> Result<LoginFinishResponse, String> {
    request_json("POST", verelle_api::LOGIN_FINISH_PATH, None, Some(request)).await
}

pub async fn recovery_start(
    request: &RecoveryStartRequest,
) -> Result<RecoveryStartResponse, String> {
    request_json(
        "POST",
        verelle_api::RECOVERY_START_PATH,
        None,
        Some(request),
    )
    .await
}

pub async fn recovery_finish(
    request: &RecoveryFinishRequest,
) -> Result<RecoveryFinishResponse, String> {
    request_json(
        "POST",
        verelle_api::RECOVERY_FINISH_PATH,
        None,
        Some(request),
    )
    .await
}

pub async fn logout(bearer_token: &str) -> Result<(), String> {
    request_empty("DELETE", verelle_api::CURRENT_SESSION_PATH, bearer_token).await
}

pub async fn delete_account(bearer_token: &str) -> Result<AccountDeletionResponse, String> {
    request_json::<(), AccountDeletionResponse>(
        "DELETE",
        verelle_api::CURRENT_ACCOUNT_PATH,
        Some(bearer_token),
        None,
    )
    .await
}

pub async fn redact_operations(
    bearer_token: &str,
    dataset_id: uuid::Uuid,
    operation_ids: &[uuid::Uuid],
) -> Result<RedactOperationsResponse, String> {
    request_json(
        "POST",
        &verelle_api::dataset_operation_redactions_path(dataset_id),
        Some(bearer_token),
        Some(&RedactOperationsRequest {
            operation_ids: operation_ids.to_vec(),
        }),
    )
    .await
}

pub async fn create_couple_invite(
    bearer_token: &str,
    request: &CoupleInviteCreateRequest,
) -> Result<CoupleInviteCreateResponse, String> {
    request_json(
        "POST",
        verelle_api::COUPLE_INVITES_PATH,
        Some(bearer_token),
        Some(request),
    )
    .await
}

pub async fn redeem_couple_invite(
    bearer_token: &str,
    request: &CoupleInviteRedeemRequest,
) -> Result<CoupleInviteRedeemResponse, String> {
    request_json(
        "POST",
        verelle_api::COUPLE_INVITE_REDEEM_PATH,
        Some(bearer_token),
        Some(request),
    )
    .await
}

pub async fn create_checkout(
    bearer_token: &str,
    request: &CheckoutSessionRequest,
) -> Result<CheckoutSessionResponse, String> {
    request_json(
        "POST",
        verelle_api::BILLING_CHECKOUT_PATH,
        Some(bearer_token),
        Some(request),
    )
    .await
}

pub async fn entitlement(bearer_token: &str) -> Result<EntitlementResponse, String> {
    request_json::<(), EntitlementResponse>(
        "GET",
        verelle_api::BILLING_ENTITLEMENT_PATH,
        Some(bearer_token),
        None,
    )
    .await
}

async fn request_json<B, R>(
    method: &str,
    path: &str,
    bearer_token: Option<&str>,
    body: Option<&B>,
) -> Result<R, String>
where
    B: Serialize,
    R: DeserializeOwned,
{
    let response = send(method, path, bearer_token, body).await?;
    let status = response.status();
    let text = response_text(&response).await?;
    if !(200..300).contains(&status) {
        return Err(api_error(status, &text));
    }
    serde_json::from_str(&text).map_err(|_| "The account response could not be decoded".to_owned())
}

async fn request_empty(method: &str, path: &str, bearer_token: &str) -> Result<(), String> {
    let response = send::<()>(method, path, Some(bearer_token), None).await?;
    let status = response.status();
    let text = response_text(&response).await?;
    if !(200..300).contains(&status) {
        return Err(api_error(status, &text));
    }
    Ok(())
}

async fn send<B: Serialize>(
    method: &str,
    path: &str,
    bearer_token: Option<&str>,
    body: Option<&B>,
) -> Result<Response, String> {
    let options = RequestInit::new();
    options.set_method(method);
    options.set_mode(RequestMode::SameOrigin);
    let body_json = body
        .map(serde_json::to_string)
        .transpose()
        .map_err(|_| "The account request could not be encoded".to_owned())?;
    if let Some(body_json) = &body_json {
        options.set_body(&JsValue::from_str(body_json));
    }
    let request = Request::new_with_str_and_init(path, &options)
        .map_err(|_| "The account request could not be created".to_owned())?;
    request
        .headers()
        .set("Accept", "application/json")
        .map_err(|_| "The account request headers could not be set".to_owned())?;
    if let Some(token) = bearer_token {
        request
            .headers()
            .set("Authorization", &format!("Bearer {token}"))
            .map_err(|_| "The account authorization header could not be set".to_owned())?;
    }
    if body_json.is_some() {
        request
            .headers()
            .set("Content-Type", "application/json")
            .map_err(|_| "The account content type could not be set".to_owned())?;
    }
    JsFuture::from(
        window()
            .ok_or_else(|| "Browser window is unavailable".to_owned())?
            .fetch_with_request(&request),
    )
    .await
    .map_err(|_| "The account service could not be reached".to_owned())?
    .dyn_into::<Response>()
    .map_err(|_| "The account response is invalid".to_owned())
}

async fn response_text(response: &Response) -> Result<String, String> {
    let text = JsFuture::from(
        response
            .text()
            .map_err(|_| "The account response body is unavailable".to_owned())?,
    )
    .await
    .map_err(|_| "The account response body could not be read".to_owned())?
    .as_string()
    .ok_or_else(|| "The account response is not text".to_owned())?;
    if text.len() > MAX_RESPONSE_CHARS {
        return Err("The account response is too large".to_owned());
    }
    Ok(text)
}

fn api_error(status: u16, body: &str) -> String {
    let code = serde_json::from_str::<verelle_api::ApiErrorBody>(body).map_or_else(
        |_| "request_failed".to_owned(),
        |value| format!("{:?}", value.error).to_lowercase(),
    );
    match (status, code.as_str()) {
        (401, _) => "The email, password, or device proof was not accepted".to_owned(),
        (409, "conflict") => "An account already exists for this email".to_owned(),
        (429, _) => "Too many account attempts. Try again later".to_owned(),
        _ => format!("The account service returned HTTP {status} ({code})"),
    }
}

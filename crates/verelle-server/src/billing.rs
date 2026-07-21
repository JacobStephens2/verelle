//! Provider-neutral subscription state machine.
//!
//! Stripe webhooks are adapters into these transitions; health ciphertext is
//! intentionally absent from every type in this module.

use crate::{
    accounts::{authenticated_account, decode_and_hash_token},
    config::StripeConfig,
    database::Database,
};
use axum::{
    Json, Router,
    body::Bytes,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, StatusCode, header::AUTHORIZATION},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx_core::{query::query, row::Row};
use sqlx_postgres::Postgres;
use std::{
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use thiserror::Error;
use uuid::Uuid;
use verelle_api::{
    ApiErrorBody, ApiErrorCode, BillingInterval, CheckoutSessionRequest, CheckoutSessionResponse,
    EntitlementResponse,
};
use zeroize::Zeroizing;

pub const GRACE_SECONDS: i64 = 7 * 24 * 60 * 60;
pub const LAPSE_RETENTION_SECONDS: i64 = 365 * 24 * 60 * 60;
pub const FINAL_WARNING_LEAD_SECONDS: i64 = 7 * 24 * 60 * 60;
const WEBHOOK_TOLERANCE_SECONDS: i64 = 5 * 60;
const WEBHOOK_BODY_LIMIT_BYTES: usize = 512 * 1024;

type HmacSha256 = Hmac<Sha256>;

#[derive(Clone)]
pub struct BillingService {
    database: Database,
    stripe: Option<Arc<StripeRuntime>>,
    enforcement_enabled: bool,
    client: reqwest::Client,
}

struct StripeRuntime {
    secret_key: Zeroizing<String>,
    webhook_secret: Zeroizing<String>,
    monthly_price_id: String,
    annual_price_id: String,
    public_origin: String,
}

#[derive(Deserialize)]
struct StripeCheckout {
    url: Option<String>,
}

impl BillingService {
    pub fn new(
        database: Database,
        stripe: Option<StripeConfig>,
        enforcement_enabled: bool,
    ) -> Self {
        Self {
            database,
            stripe: stripe.map(|config| {
                Arc::new(StripeRuntime {
                    secret_key: Zeroizing::new(config.secret_key),
                    webhook_secret: Zeroizing::new(config.webhook_secret),
                    monthly_price_id: config.monthly_price_id,
                    annual_price_id: config.annual_price_id,
                    public_origin: config.public_origin,
                })
            }),
            enforcement_enabled,
            client: reqwest::Client::new(),
        }
    }

    async fn account_id(&self, token: &str) -> Result<Uuid, BillingError> {
        let token_hash = decode_and_hash_token(token).map_err(|_| BillingError::Unauthorized)?;
        let mut transaction = self.database.pool().begin().await?;
        let account_id = authenticated_account(&mut transaction, &token_hash)
            .await
            .map_err(|_| BillingError::Unauthorized)?;
        transaction.commit().await?;
        Ok(account_id)
    }

    async fn create_checkout(
        &self,
        token: &str,
        request: CheckoutSessionRequest,
    ) -> Result<CheckoutSessionResponse, BillingError> {
        let stripe = self.stripe.as_ref().ok_or(BillingError::Unavailable)?;
        let account_id = self.account_id(token).await?;
        let price = match request.interval {
            BillingInterval::Monthly => &stripe.monthly_price_id,
            BillingInterval::Annual => &stripe.annual_price_id,
        };
        let account_id = account_id.to_string();
        let success_url = format!("{}/?checkout=success", stripe.public_origin);
        let cancel_url = format!("{}/?checkout=cancelled", stripe.public_origin);
        let form = [
            ("mode", "subscription"),
            ("line_items[0][price]", price.as_str()),
            ("line_items[0][quantity]", "1"),
            ("success_url", success_url.as_str()),
            ("cancel_url", cancel_url.as_str()),
            ("client_reference_id", account_id.as_str()),
            ("metadata[account_id]", account_id.as_str()),
            (
                "subscription_data[metadata][account_id]",
                account_id.as_str(),
            ),
            ("allow_promotion_codes", "true"),
        ];
        let response = self
            .client
            .post("https://api.stripe.com/v1/checkout/sessions")
            .bearer_auth(stripe.secret_key.as_str())
            .form(&form)
            .send()
            .await
            .map_err(|_| BillingError::Provider)?;
        if !response.status().is_success() {
            return Err(BillingError::Provider);
        }
        let checkout = response
            .json::<StripeCheckout>()
            .await
            .map_err(|_| BillingError::Provider)?;
        let checkout_url = checkout
            .url
            .filter(|url| url.starts_with("https://checkout.stripe.com/"))
            .ok_or(BillingError::Provider)?;
        Ok(CheckoutSessionResponse { checkout_url })
    }

    async fn entitlement(&self, token: &str) -> Result<EntitlementResponse, BillingError> {
        let account_id = self.account_id(token).await?;
        let row = query::<Postgres>(
            "SELECT status, EXTRACT(EPOCH FROM current_period_ends_at)::BIGINT AS period_end, \
                    EXTRACT(EPOCH FROM grace_ends_at)::BIGINT AS grace_end, \
                    EXTRACT(EPOCH FROM scheduled_ciphertext_deletion_at)::BIGINT AS deletion_at \
             FROM subscription_entitlements WHERE account_id = $1",
        )
        .bind(account_id)
        .fetch_optional(self.database.pool())
        .await?;
        let status = row
            .as_ref()
            .map_or_else(|| "free".to_owned(), |row| row.get("status"));
        Ok(EntitlementResponse {
            sync_allowed: !self.enforcement_enabled
                || matches!(status.as_str(), "active" | "grace"),
            current_period_ends_at_unix_seconds: row.as_ref().and_then(|row| row.get("period_end")),
            grace_ends_at_unix_seconds: row.as_ref().and_then(|row| row.get("grace_end")),
            scheduled_deletion_at_unix_seconds: row.as_ref().and_then(|row| row.get("deletion_at")),
            status,
        })
    }

    async fn process_webhook(&self, headers: &HeaderMap, body: &[u8]) -> Result<(), BillingError> {
        let stripe = self.stripe.as_ref().ok_or(BillingError::Unavailable)?;
        let signature = headers
            .get("stripe-signature")
            .and_then(|value| value.to_str().ok())
            .ok_or(BillingError::InvalidSignature)?;
        verify_stripe_signature(stripe.webhook_secret.as_bytes(), signature, body)?;
        let event: Value = serde_json::from_slice(body).map_err(|_| BillingError::InvalidEvent)?;
        let event_id = string_at(&event, &["id"]).ok_or(BillingError::InvalidEvent)?;
        let event_kind = string_at(&event, &["type"]).ok_or(BillingError::InvalidEvent)?;
        let created = integer_at(&event, &["created"]).ok_or(BillingError::InvalidEvent)?;
        let payload_hash: [u8; 32] = Sha256::digest(body).into();
        let object = event
            .pointer("/data/object")
            .ok_or(BillingError::InvalidEvent)?;
        let mut transaction = self.database.pool().begin().await?;
        let inserted = query::<Postgres>(
            "INSERT INTO billing_webhook_events \
             (provider, provider_event_id, event_kind, payload_hash) VALUES ('stripe', $1, $2, $3) \
             ON CONFLICT DO NOTHING RETURNING provider_event_id",
        )
        .bind(event_id)
        .bind(event_kind)
        .bind(payload_hash.as_slice())
        .fetch_optional(&mut *transaction)
        .await?;
        if inserted.is_none() {
            transaction.commit().await?;
            return Ok(());
        }

        if let Some(account_id) = webhook_account_id(object) {
            let status = webhook_status(event_kind, object);
            if let Some(status) = status {
                let customer_id = string_at(object, &["customer"]);
                let subscription_id = if event_kind.starts_with("customer.subscription.") {
                    string_at(object, &["id"])
                } else {
                    string_at(object, &["subscription"]).or_else(|| {
                        string_at(object, &["parent", "subscription_details", "subscription"])
                    })
                };
                let period_end = integer_at(object, &["current_period_end"]);
                let now = created;
                let grace_end = (status == "grace").then(|| now.saturating_add(GRACE_SECONDS));
                let deletion_at = matches!(status, "paused" | "refunded")
                    .then(|| now.saturating_add(LAPSE_RETENTION_SECONDS));
                query::<Postgres>(
                    "INSERT INTO subscription_entitlements \
                     (account_id, provider, provider_customer_id, provider_subscription_id, status, \
                      current_period_ends_at, grace_ends_at, scheduled_ciphertext_deletion_at, \
                      provider_event_created_at, updated_at) \
                     VALUES ($1, 'stripe', $2, $3, $4, \
                             CASE WHEN $5::BIGINT IS NULL THEN NULL ELSE to_timestamp($5) END, \
                             CASE WHEN $6::BIGINT IS NULL THEN NULL ELSE to_timestamp($6) END, \
                             CASE WHEN $7::BIGINT IS NULL THEN NULL ELSE to_timestamp($7) END, \
                             to_timestamp($8), CURRENT_TIMESTAMP) \
                     ON CONFLICT (account_id) DO UPDATE SET \
                       provider = 'stripe', \
                       provider_customer_id = COALESCE(EXCLUDED.provider_customer_id, subscription_entitlements.provider_customer_id), \
                       provider_subscription_id = COALESCE(EXCLUDED.provider_subscription_id, subscription_entitlements.provider_subscription_id), \
                       status = EXCLUDED.status, current_period_ends_at = EXCLUDED.current_period_ends_at, \
                       grace_ends_at = EXCLUDED.grace_ends_at, \
                       scheduled_ciphertext_deletion_at = EXCLUDED.scheduled_ciphertext_deletion_at, \
                       provider_event_created_at = EXCLUDED.provider_event_created_at, updated_at = CURRENT_TIMESTAMP \
                     WHERE subscription_entitlements.provider_event_created_at IS NULL \
                        OR subscription_entitlements.provider_event_created_at <= EXCLUDED.provider_event_created_at",
                )
                .bind(account_id)
                .bind(customer_id)
                .bind(subscription_id)
                .bind(status)
                .bind(period_end)
                .bind(grace_end)
                .bind(deletion_at)
                .bind(created)
                .execute(&mut *transaction)
                .await?;
                if let Some(deletion_at) = deletion_at {
                    enqueue_warnings(&mut transaction, account_id, now, deletion_at).await?;
                } else if status == "active" {
                    query::<Postgres>(
                        "DELETE FROM billing_notification_outbox WHERE account_id = $1",
                    )
                    .bind(account_id)
                    .execute(&mut *transaction)
                    .await?;
                }
            }
        }
        query::<Postgres>(
            "UPDATE billing_webhook_events SET processed_at = CURRENT_TIMESTAMP \
             WHERE provider = 'stripe' AND provider_event_id = $1",
        )
        .bind(event_id)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(())
    }

    /// Advance grace periods, queue both retention warnings, and erase
    /// ciphertext only when every active member of a dataset is independently
    /// past the 12-month deadline.
    #[allow(clippy::too_many_lines)] // Keep the destructive retention transaction linear for audit.
    pub async fn run_maintenance_once(&self) -> Result<(u64, u64), BillingError> {
        if !self.enforcement_enabled {
            return Ok((0, 0));
        }
        let now = unix_seconds()?;
        let mut transaction = self.database.pool().begin().await?;
        let paused = query::<Postgres>(
            "UPDATE subscription_entitlements SET status = 'paused', grace_ends_at = NULL, \
                    scheduled_ciphertext_deletion_at = CURRENT_TIMESTAMP + INTERVAL '1 year', \
                    updated_at = CURRENT_TIMESTAMP \
             WHERE status = 'grace' AND grace_ends_at <= CURRENT_TIMESTAMP \
             RETURNING account_id, \
               EXTRACT(EPOCH FROM scheduled_ciphertext_deletion_at)::BIGINT AS deletion_at",
        )
        .fetch_all(&mut *transaction)
        .await?;
        for row in &paused {
            enqueue_warnings(
                &mut transaction,
                row.get("account_id"),
                now,
                row.get("deletion_at"),
            )
            .await?;
        }
        transaction.commit().await?;

        let candidates = query::<Postgres>(
            "SELECT DISTINCT membership.dataset_id \
             FROM dataset_memberships membership \
             JOIN subscription_entitlements entitlement USING (account_id) \
             WHERE membership.removed_at IS NULL \
               AND entitlement.status IN ('paused', 'lapsed', 'refunded') \
               AND entitlement.scheduled_ciphertext_deletion_at <= CURRENT_TIMESTAMP",
        )
        .fetch_all(self.database.pool())
        .await?;
        let mut deleted = 0_u64;
        for candidate in candidates {
            let dataset_id: Uuid = candidate.get("dataset_id");
            let mut transaction = self.database.pool().begin().await?;
            let members = query::<Postgres>(
                "SELECT membership.account_id FROM dataset_memberships membership \
                 WHERE membership.dataset_id = $1 AND membership.removed_at IS NULL \
                 FOR UPDATE OF membership",
            )
            .bind(dataset_id)
            .fetch_all(&mut *transaction)
            .await?;
            let mut all_due = !members.is_empty();
            for member in &members {
                let entitlement = query::<Postgres>(
                    "SELECT status IN ('paused', 'lapsed', 'refunded') \
                            AND scheduled_ciphertext_deletion_at <= CURRENT_TIMESTAMP AS due \
                     FROM subscription_entitlements WHERE account_id = $1 FOR UPDATE",
                )
                .bind(member.get::<Uuid, _>("account_id"))
                .fetch_optional(&mut *transaction)
                .await?;
                if entitlement.is_none_or(|row| !row.get::<bool, _>("due")) {
                    all_due = false;
                    break;
                }
            }
            if !all_due {
                transaction.rollback().await?;
                continue;
            }
            let requested_account_id: Uuid = members[0].get("account_id");
            let deletion_id = Uuid::new_v4();
            query::<Postgres>(
                "INSERT INTO deletion_manifests \
                 (deletion_id, requested_account_id, completed_at) \
                 VALUES ($1, $2, CURRENT_TIMESTAMP)",
            )
            .bind(deletion_id)
            .bind(requested_account_id)
            .execute(&mut *transaction)
            .await?;
            query::<Postgres>(
                "INSERT INTO deletion_manifest_datasets (deletion_id, dataset_id) VALUES ($1, $2)",
            )
            .bind(deletion_id)
            .bind(dataset_id)
            .execute(&mut *transaction)
            .await?;
            let ledger_id = query::<Postgres>(
                "INSERT INTO deletion_ledger \
                 (deletion_id, account_id, dataset_count, reason) \
                 VALUES ($1, $2, 1, 'subscription_retention') RETURNING ledger_id",
            )
            .bind(deletion_id)
            .bind(requested_account_id)
            .fetch_one(&mut *transaction)
            .await?
            .get::<i64, _>("ledger_id");
            query::<Postgres>(
                "INSERT INTO deletion_ledger_datasets (ledger_id, dataset_id) VALUES ($1, $2)",
            )
            .bind(ledger_id)
            .bind(dataset_id)
            .execute(&mut *transaction)
            .await?;
            query::<Postgres>("DELETE FROM sync_datasets WHERE dataset_id = $1")
                .bind(dataset_id)
                .execute(&mut *transaction)
                .await?;
            transaction.commit().await?;
            deleted = deleted.saturating_add(1);
        }
        Ok((u64::try_from(paused.len()).unwrap_or(u64::MAX), deleted))
    }
}

async fn enqueue_warnings(
    transaction: &mut sqlx_core::transaction::Transaction<'_, Postgres>,
    account_id: Uuid,
    now: i64,
    deletion_at: i64,
) -> Result<(), BillingError> {
    for (kind, due) in [
        ("lapse_started", now),
        (
            "deletion_warning",
            deletion_at.saturating_sub(FINAL_WARNING_LEAD_SECONDS),
        ),
    ] {
        query::<Postgres>(
            "INSERT INTO billing_notification_outbox (notification_id, account_id, kind, due_at) \
             VALUES ($1, $2, $3, to_timestamp($4)) \
             ON CONFLICT (account_id, kind) DO UPDATE SET due_at = EXCLUDED.due_at, \
                 claimed_at = NULL, sent_at = NULL, last_error = NULL",
        )
        .bind(Uuid::new_v4())
        .bind(account_id)
        .bind(kind)
        .bind(due)
        .execute(&mut **transaction)
        .await?;
    }
    Ok(())
}

fn webhook_account_id(object: &Value) -> Option<Uuid> {
    [
        &["client_reference_id"][..],
        &["metadata", "account_id"][..],
        &["subscription_details", "metadata", "account_id"][..],
        &["parent", "subscription_details", "metadata", "account_id"][..],
    ]
    .into_iter()
    .find_map(|path| string_at(object, path))
    .and_then(|value| Uuid::parse_str(value).ok())
}

fn webhook_status<'a>(event_kind: &str, object: &'a Value) -> Option<&'a str> {
    match event_kind {
        "checkout.session.completed" | "invoice.paid" => Some("active"),
        "invoice.payment_failed" => Some("grace"),
        "charge.refunded" => Some("refunded"),
        "customer.subscription.deleted" => Some("paused"),
        "customer.subscription.created" | "customer.subscription.updated" => {
            match string_at(object, &["status"])? {
                "active" | "trialing" => Some("active"),
                "past_due" | "unpaid" | "incomplete" => Some("grace"),
                "canceled" | "incomplete_expired" | "paused" => Some("paused"),
                _ => None,
            }
        }
        _ => None,
    }
}

fn string_at<'a>(value: &'a Value, path: &[&str]) -> Option<&'a str> {
    path.iter()
        .try_fold(value, |current, key| current.get(*key))?
        .as_str()
}

fn integer_at(value: &Value, path: &[&str]) -> Option<i64> {
    path.iter()
        .try_fold(value, |current, key| current.get(*key))?
        .as_i64()
}

fn verify_stripe_signature(secret: &[u8], header: &str, body: &[u8]) -> Result<(), BillingError> {
    verify_stripe_signature_at(secret, header, body, unix_seconds()?)
}

fn verify_stripe_signature_at(
    secret: &[u8],
    header: &str,
    body: &[u8],
    now: i64,
) -> Result<(), BillingError> {
    let timestamp = header
        .split(',')
        .find_map(|part| part.strip_prefix("t="))
        .and_then(|value| value.parse::<i64>().ok())
        .ok_or(BillingError::InvalidSignature)?;
    let signature = header
        .split(',')
        .filter_map(|part| part.strip_prefix("v1="))
        .find_map(decode_hex)
        .ok_or(BillingError::InvalidSignature)?;
    if now.abs_diff(timestamp) > u64::try_from(WEBHOOK_TOLERANCE_SECONDS).unwrap_or(300) {
        return Err(BillingError::InvalidSignature);
    }
    let mut signed = timestamp.to_string().into_bytes();
    signed.push(b'.');
    signed.extend_from_slice(body);
    let mut mac = HmacSha256::new_from_slice(secret).map_err(|_| BillingError::InvalidSignature)?;
    mac.update(&signed);
    mac.verify_slice(&signature)
        .map_err(|_| BillingError::InvalidSignature)
}

fn decode_hex(value: &str) -> Option<Vec<u8>> {
    if !value.len().is_multiple_of(2) {
        return None;
    }
    value
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let high = (pair[0] as char).to_digit(16)?;
            let low = (pair[1] as char).to_digit(16)?;
            u8::try_from((high << 4) | low).ok()
        })
        .collect()
}

fn unix_seconds() -> Result<i64, BillingError> {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| BillingError::Clock)?
        .as_secs();
    i64::try_from(seconds).map_err(|_| BillingError::Clock)
}

pub fn billing_router(service: BillingService) -> Router {
    Router::new()
        .route(verelle_api::BILLING_CHECKOUT_PATH, post(checkout))
        .route(verelle_api::BILLING_ENTITLEMENT_PATH, get(entitlement))
        .route(verelle_api::STRIPE_WEBHOOK_PATH, post(stripe_webhook))
        .layer(DefaultBodyLimit::max(WEBHOOK_BODY_LIMIT_BYTES))
        .with_state(service)
}

async fn checkout(
    State(service): State<BillingService>,
    headers: HeaderMap,
    Json(request): Json<CheckoutSessionRequest>,
) -> Result<Json<CheckoutSessionResponse>, BillingError> {
    Ok(Json(
        service
            .create_checkout(bearer_token(&headers)?, request)
            .await?,
    ))
}

async fn entitlement(
    State(service): State<BillingService>,
    headers: HeaderMap,
) -> Result<Json<EntitlementResponse>, BillingError> {
    Ok(Json(service.entitlement(bearer_token(&headers)?).await?))
}

async fn stripe_webhook(
    State(service): State<BillingService>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<StatusCode, BillingError> {
    service.process_webhook(&headers, &body).await?;
    Ok(StatusCode::OK)
}

fn bearer_token(headers: &HeaderMap) -> Result<&str, BillingError> {
    headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|value| !value.is_empty() && value.len() <= 512)
        .ok_or(BillingError::Unauthorized)
}

#[derive(Debug, Error)]
pub enum BillingError {
    #[error("authentication is required")]
    Unauthorized,
    #[error("billing is not configured")]
    Unavailable,
    #[error("the billing provider failed")]
    Provider,
    #[error("the webhook signature is invalid")]
    InvalidSignature,
    #[error("the webhook event is invalid")]
    InvalidEvent,
    #[error("the system clock is invalid")]
    Clock,
    #[error("database operation failed")]
    Database(#[from] sqlx_core::error::Error),
}

impl IntoResponse for BillingError {
    fn into_response(self) -> Response {
        let (status, code) = match self {
            Self::Unauthorized => (
                StatusCode::UNAUTHORIZED,
                ApiErrorCode::AuthenticationRequired,
            ),
            Self::Unavailable => (
                StatusCode::SERVICE_UNAVAILABLE,
                ApiErrorCode::ServiceUnavailable,
            ),
            Self::Provider => (StatusCode::BAD_GATEWAY, ApiErrorCode::ServiceUnavailable),
            Self::InvalidSignature | Self::InvalidEvent | Self::Clock => {
                (StatusCode::BAD_REQUEST, ApiErrorCode::InvalidRequest)
            }
            Self::Database(_) => (StatusCode::INTERNAL_SERVER_ERROR, ApiErrorCode::Internal),
        };
        (
            status,
            Json(ApiErrorBody {
                error: code,
                request_id: Uuid::new_v4(),
            }),
        )
            .into_response()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntitlementStatus {
    Free,
    Active,
    Grace,
    Paused,
    Lapsed,
    Refunded,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SubscriptionLifecycle {
    pub status: EntitlementStatus,
    pub current_period_ends_at: Option<i64>,
    pub grace_ends_at: Option<i64>,
    pub scheduled_deletion_at: Option<i64>,
    pub first_warning_due: bool,
    pub final_warning_due: bool,
}

impl Default for SubscriptionLifecycle {
    fn default() -> Self {
        Self {
            status: EntitlementStatus::Free,
            current_period_ends_at: None,
            grace_ends_at: None,
            scheduled_deletion_at: None,
            first_warning_due: false,
            final_warning_due: false,
        }
    }
}

impl SubscriptionLifecycle {
    pub fn activate(&mut self, period_end: i64) {
        self.status = EntitlementStatus::Active;
        self.current_period_ends_at = Some(period_end);
        self.grace_ends_at = None;
        self.scheduled_deletion_at = None;
        self.first_warning_due = false;
        self.final_warning_due = false;
    }

    pub fn payment_failed(&mut self, now: i64) {
        self.status = EntitlementStatus::Grace;
        self.grace_ends_at = Some(now.saturating_add(GRACE_SECONDS));
    }

    pub fn refund(&mut self, now: i64) {
        self.status = EntitlementStatus::Refunded;
        self.grace_ends_at = None;
        self.scheduled_deletion_at = Some(now.saturating_add(LAPSE_RETENTION_SECONDS));
        self.first_warning_due = true;
    }

    pub fn advance(&mut self, now: i64) {
        if self.status == EntitlementStatus::Grace
            && self.grace_ends_at.is_some_and(|deadline| now >= deadline)
        {
            self.status = EntitlementStatus::Paused;
            self.scheduled_deletion_at = Some(now.saturating_add(LAPSE_RETENTION_SECONDS));
            self.first_warning_due = true;
        }
        if self.status == EntitlementStatus::Paused
            && self
                .scheduled_deletion_at
                .is_some_and(|deadline| now >= deadline.saturating_sub(FINAL_WARNING_LEAD_SECONDS))
        {
            self.status = EntitlementStatus::Lapsed;
            self.final_warning_due = true;
        }
    }

    pub fn deletion_due(&self, now: i64) -> bool {
        matches!(
            self.status,
            EntitlementStatus::Paused | EntitlementStatus::Lapsed | EntitlementStatus::Refunded
        ) && self
            .scheduled_deletion_at
            .is_some_and(|deadline| now >= deadline)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simulated_purchase_lapse_warning_retention_and_recovery_lifecycle() {
        let mut lifecycle = SubscriptionLifecycle::default();
        lifecycle.activate(1_000);
        assert_eq!(lifecycle.status, EntitlementStatus::Active);

        lifecycle.payment_failed(1_000);
        assert_eq!(lifecycle.status, EntitlementStatus::Grace);
        lifecycle.advance(1_000 + GRACE_SECONDS - 1);
        assert_eq!(lifecycle.status, EntitlementStatus::Grace);
        lifecycle.advance(1_000 + GRACE_SECONDS);
        assert_eq!(lifecycle.status, EntitlementStatus::Paused);
        assert!(lifecycle.first_warning_due);

        let deletion = lifecycle.scheduled_deletion_at.unwrap();
        lifecycle.advance(deletion - FINAL_WARNING_LEAD_SECONDS);
        assert_eq!(lifecycle.status, EntitlementStatus::Lapsed);
        assert!(lifecycle.final_warning_due);
        assert!(!lifecycle.deletion_due(deletion - 1));
        assert!(lifecycle.deletion_due(deletion));

        lifecycle.activate(deletion + 30 * 24 * 60 * 60);
        assert_eq!(lifecycle.status, EntitlementStatus::Active);
        assert_eq!(lifecycle.scheduled_deletion_at, None);
    }

    #[test]
    fn refund_schedules_but_never_immediately_executes_deletion() {
        let mut lifecycle = SubscriptionLifecycle::default();
        lifecycle.activate(50);
        lifecycle.refund(10);
        assert_eq!(lifecycle.status, EntitlementStatus::Refunded);
        assert!(!lifecycle.deletion_due(10));
        assert!(lifecycle.deletion_due(10 + LAPSE_RETENTION_SECONDS));
    }

    #[test]
    fn stripe_signatures_are_body_bound_and_time_bounded() {
        use std::fmt::Write as _;

        let secret = b"whsec_test";
        let body = br#"{"id":"evt_1"}"#;
        let timestamp = 1_000_i64;
        let mut mac = HmacSha256::new_from_slice(secret).unwrap();
        mac.update(format!("{timestamp}.").as_bytes());
        mac.update(body);
        let signature = mac.finalize().into_bytes();
        let hex = signature.iter().fold(String::new(), |mut output, byte| {
            write!(output, "{byte:02x}").unwrap();
            output
        });
        let header = format!("t={timestamp},v1={hex}");

        assert!(verify_stripe_signature_at(secret, &header, body, timestamp).is_ok());
        assert!(verify_stripe_signature_at(secret, &header, b"{}", timestamp).is_err());
        assert!(verify_stripe_signature_at(secret, &header, body, timestamp + 301).is_err());
    }
}

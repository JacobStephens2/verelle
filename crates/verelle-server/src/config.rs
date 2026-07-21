use anyhow::{Context, Result, bail};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use std::{env, net::SocketAddr, time::Duration};

const DEFAULT_BIND_ADDRESS: &str = "127.0.0.1:3000";
const DEFAULT_MAX_DATABASE_CONNECTIONS: u32 = 10;

#[derive(Clone, PartialEq, Eq)]
pub struct StripeConfig {
    pub secret_key: String,
    pub webhook_secret: String,
    pub monthly_price_id: String,
    pub annual_price_id: String,
    pub public_origin: String,
}

#[derive(Clone, PartialEq, Eq)]
pub struct Config {
    pub bind_address: SocketAddr,
    pub database_url: String,
    pub max_database_connections: u32,
    pub database_acquire_timeout: Duration,
    pub reviewed_api_enabled: bool,
    pub opaque_server_setup: Option<Vec<u8>>,
    pub oq9_review_reference: Option<String>,
    pub billing_enforcement: bool,
    pub stripe: Option<StripeConfig>,
}

impl Config {
    pub fn from_environment() -> Result<Self> {
        let bind_address = env::var("VERELLE_BIND_ADDRESS")
            .unwrap_or_else(|_| DEFAULT_BIND_ADDRESS.to_owned())
            .parse()
            .context("VERELLE_BIND_ADDRESS must be a socket address")?;
        let database_url = env::var("DATABASE_URL")
            .context("DATABASE_URL is required; the server does not start without PostgreSQL")?;
        if database_url.trim().is_empty() {
            bail!("DATABASE_URL must not be empty");
        }
        let max_database_connections = env::var("VERELLE_DATABASE_MAX_CONNECTIONS").map_or(
            Ok(DEFAULT_MAX_DATABASE_CONNECTIONS),
            |value| {
                value
                    .parse::<u32>()
                    .context("VERELLE_DATABASE_MAX_CONNECTIONS must be a positive integer")
            },
        )?;
        if max_database_connections == 0 {
            bail!("VERELLE_DATABASE_MAX_CONNECTIONS must be greater than zero");
        }
        let acquire_timeout_seconds =
            env::var("VERELLE_DATABASE_ACQUIRE_TIMEOUT_SECONDS").map_or(Ok(5_u64), |value| {
                value
                    .parse::<u64>()
                    .context("VERELLE_DATABASE_ACQUIRE_TIMEOUT_SECONDS must be a positive integer")
            })?;
        if acquire_timeout_seconds == 0 {
            bail!("VERELLE_DATABASE_ACQUIRE_TIMEOUT_SECONDS must be greater than zero");
        }
        let reviewed_api_enabled =
            env::var("VERELLE_REVIEWED_API_ENABLED").map_or(Ok(false), |value| {
                match value.as_str() {
                    "true" => Ok(true),
                    "false" => Ok(false),
                    _ => bail!("VERELLE_REVIEWED_API_ENABLED must be true or false"),
                }
            })?;
        let opaque_server_setup = env::var("VERELLE_OPAQUE_SERVER_SETUP")
            .ok()
            .map(|value| {
                URL_SAFE_NO_PAD
                    .decode(value)
                    .context("VERELLE_OPAQUE_SERVER_SETUP must be base64url without padding")
            })
            .transpose()?;
        let oq9_review_reference = env::var("VERELLE_OQ9_REVIEW_REFERENCE")
            .ok()
            .filter(|value| !value.trim().is_empty());
        if reviewed_api_enabled && opaque_server_setup.is_none() {
            bail!("VERELLE_OPAQUE_SERVER_SETUP is required when the reviewed API is enabled");
        }
        if reviewed_api_enabled && oq9_review_reference.is_none() {
            bail!("VERELLE_OQ9_REVIEW_REFERENCE is required when the reviewed API is enabled");
        }
        let billing_enforcement = parse_boolean("VERELLE_BILLING_ENFORCEMENT", false)?;
        let stripe_values = [
            "STRIPE_SECRET_KEY",
            "STRIPE_WEBHOOK_SECRET",
            "STRIPE_MONTHLY_PRICE_ID",
            "STRIPE_ANNUAL_PRICE_ID",
            "VERELLE_PUBLIC_ORIGIN",
        ]
        .map(|name| env::var(name).ok().filter(|value| !value.trim().is_empty()));
        let stripe = if stripe_values.iter().all(Option::is_none) {
            None
        } else if let [
            Some(secret_key),
            Some(webhook_secret),
            Some(monthly_price_id),
            Some(annual_price_id),
            Some(public_origin),
        ] = stripe_values
        {
            if !public_origin.starts_with("https://") || public_origin.ends_with('/') {
                bail!("VERELLE_PUBLIC_ORIGIN must be an HTTPS origin without a trailing slash");
            }
            Some(StripeConfig {
                secret_key,
                webhook_secret,
                monthly_price_id,
                annual_price_id,
                public_origin,
            })
        } else {
            bail!("Stripe configuration is all-or-nothing");
        };
        if billing_enforcement && stripe.is_none() {
            bail!("Stripe configuration is required when billing enforcement is enabled");
        }

        Ok(Self {
            bind_address,
            database_url,
            max_database_connections,
            database_acquire_timeout: Duration::from_secs(acquire_timeout_seconds),
            reviewed_api_enabled,
            opaque_server_setup,
            oq9_review_reference,
            billing_enforcement,
            stripe,
        })
    }
}

fn parse_boolean(name: &str, default: bool) -> Result<bool> {
    env::var(name).map_or(Ok(default), |value| match value.as_str() {
        "true" => Ok(true),
        "false" => Ok(false),
        _ => bail!("{name} must be true or false"),
    })
}

-- Billing metadata is deliberately isolated from encrypted health data.
-- Provider identifiers never appear in sync_datasets or encrypted_operations.

CREATE TABLE subscription_entitlements (
    account_id UUID PRIMARY KEY REFERENCES accounts(account_id) ON DELETE CASCADE,
    provider TEXT CHECK (provider IS NULL OR provider = 'stripe'),
    provider_customer_id TEXT UNIQUE,
    provider_subscription_id TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'free'
        CHECK (status IN ('free', 'active', 'grace', 'paused', 'lapsed', 'refunded')),
    current_period_ends_at TIMESTAMPTZ,
    grace_ends_at TIMESTAMPTZ,
    scheduled_ciphertext_deletion_at TIMESTAMPTZ,
    first_warning_sent_at TIMESTAMPTZ,
    final_warning_sent_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((provider_customer_id IS NULL) = (provider IS NULL)),
    CHECK (grace_ends_at IS NULL OR current_period_ends_at IS NULL OR grace_ends_at >= current_period_ends_at)
);

CREATE TABLE billing_webhook_events (
    provider TEXT NOT NULL CHECK (provider = 'stripe'),
    provider_event_id TEXT NOT NULL,
    event_kind TEXT NOT NULL CHECK (octet_length(event_kind) BETWEEN 1 AND 128),
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ,
    payload_hash BYTEA NOT NULL CHECK (octet_length(payload_hash) = 32),
    PRIMARY KEY (provider, provider_event_id)
);

COMMENT ON TABLE subscription_entitlements IS
    'Account-level commercial state only; never joined into or copied beside observation ciphertext.';
COMMENT ON TABLE billing_webhook_events IS
    'Idempotency ledger containing event metadata and a payload hash, never full provider payloads.';

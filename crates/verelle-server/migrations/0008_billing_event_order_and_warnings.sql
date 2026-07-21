ALTER TABLE subscription_entitlements
    ADD COLUMN provider_event_created_at TIMESTAMPTZ;

CREATE TABLE billing_notification_outbox (
    notification_id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('lapse_started', 'deletion_warning')),
    due_at TIMESTAMPTZ NOT NULL,
    claimed_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    last_error TEXT,
    UNIQUE (account_id, kind)
);

CREATE INDEX billing_notification_due
    ON billing_notification_outbox (due_at)
    WHERE sent_at IS NULL;

COMMENT ON TABLE billing_notification_outbox IS
    'Metadata-only queue; a separately configured mail adapter sends warnings without chart data.';

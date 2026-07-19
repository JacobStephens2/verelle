-- Adds client-authorized lost-device recovery. The recovery code and account
-- data key remain client-side; only a P-256 public verifier is retained.

ALTER TABLE accounts
    ADD COLUMN recovery_public_key BYTEA
    CHECK (recovery_public_key IS NULL OR octet_length(recovery_public_key) BETWEEN 1 AND 1024);

CREATE TABLE account_recovery_flows (
    flow_id UUID PRIMARY KEY,
    identifier_hash BYTEA NOT NULL CHECK (octet_length(identifier_hash) = 32),
    account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    dataset_id UUID NOT NULL REFERENCES sync_datasets(dataset_id) ON DELETE CASCADE,
    recovery_challenge BYTEA NOT NULL CHECK (octet_length(recovery_challenge) = 32),
    request_hash BYTEA CHECK (request_hash IS NULL OR octet_length(request_hash) = 32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    CHECK (expires_at > created_at)
);

COMMENT ON COLUMN accounts.recovery_public_key IS
    'P-256 SPKI verifier derived from the random client account key; no recovery secret.';
COMMENT ON TABLE account_recovery_flows IS
    'Short-lived challenges for recovery-code-authorized password and device replacement.';

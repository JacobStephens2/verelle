-- Implements the reviewed-authentication schema boundary from KEY-I1..I5.
-- No password, OPAQUE export/session key, account/couple data key, recovery
-- code, chart record key, or observation plaintext is stored here.

CREATE TABLE accounts (
    account_id UUID PRIMARY KEY,
    identifier_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(identifier_hash) = 32),
    opaque_password_file BYTEA NOT NULL CHECK (octet_length(opaque_password_file) BETWEEN 1 AND 4096),
    wrapped_account_key BYTEA NOT NULL CHECK (octet_length(wrapped_account_key) BETWEEN 1 AND 4096),
    recovery_wrapped_account_key BYTEA NOT NULL CHECK (octet_length(recovery_wrapped_account_key) BETWEEN 1 AND 4096),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    disabled_at TIMESTAMPTZ
);

CREATE TABLE account_devices (
    device_id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    public_key BYTEA NOT NULL CHECK (octet_length(public_key) BETWEEN 1 AND 1024),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ,
    UNIQUE (account_id, device_id)
);

CREATE TABLE dataset_memberships (
    dataset_id UUID NOT NULL REFERENCES sync_datasets(dataset_id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'partner')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    removed_at TIMESTAMPTZ,
    PRIMARY KEY (dataset_id, account_id)
);

CREATE INDEX dataset_memberships_active_account
    ON dataset_memberships (account_id, dataset_id)
    WHERE removed_at IS NULL;

CREATE TABLE dataset_key_wraps (
    dataset_id UUID NOT NULL REFERENCES sync_datasets(dataset_id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    key_epoch BIGINT NOT NULL CHECK (key_epoch > 0),
    wrapped_key BYTEA NOT NULL CHECK (octet_length(wrapped_key) BETWEEN 1 AND 4096),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (dataset_id, account_id, key_epoch)
);

CREATE TABLE account_sessions (
    session_id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES account_devices(device_id) ON DELETE CASCADE,
    token_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    CHECK (expires_at > created_at)
);

CREATE INDEX account_sessions_active_token
    ON account_sessions (token_hash, expires_at)
    WHERE revoked_at IS NULL;

CREATE TABLE opaque_auth_flows (
    flow_id UUID PRIMARY KEY,
    flow_kind TEXT NOT NULL CHECK (flow_kind IN ('registration', 'login')),
    identifier_hash BYTEA NOT NULL CHECK (octet_length(identifier_hash) = 32),
    account_id UUID REFERENCES accounts(account_id) ON DELETE CASCADE,
    opaque_server_state BYTEA CHECK (opaque_server_state IS NULL OR octet_length(opaque_server_state) BETWEEN 1 AND 4096),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    CHECK (expires_at > created_at),
    CHECK (
        (flow_kind = 'registration' AND account_id IS NULL AND opaque_server_state IS NULL)
        OR flow_kind = 'login'
    )
);

CREATE INDEX opaque_auth_flows_rate_limit
    ON opaque_auth_flows (identifier_hash, created_at DESC);

COMMENT ON COLUMN accounts.identifier_hash IS
    'SHA-256 of the normalized account identifier; the normalized value is not retained.';
COMMENT ON COLUMN accounts.opaque_password_file IS
    'RFC 9807 OPAQUE registration record; password-equivalent sensitivity, never logged.';
COMMENT ON COLUMN account_sessions.token_hash IS
    'SHA-256 of a random bearer token; the bearer value is returned once and never stored.';

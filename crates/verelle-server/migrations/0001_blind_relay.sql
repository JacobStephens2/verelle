-- This migration deliberately creates no account, password, session, member,
-- or public API tables. Production authentication remains blocked by OQ-9 and
-- ADR 0003. The rows below are opaque relay state only.

CREATE TABLE sync_datasets (
    dataset_id UUID PRIMARY KEY,
    current_epoch BIGINT NOT NULL CHECK (current_epoch > 0),
    last_sequence BIGINT NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
    rotation_pending BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE encrypted_operations (
    dataset_id UUID NOT NULL REFERENCES sync_datasets(dataset_id) ON DELETE CASCADE,
    server_sequence BIGINT NOT NULL CHECK (server_sequence > 0),
    operation_id UUID NOT NULL,
    key_epoch BIGINT NOT NULL CHECK (key_epoch > 0),
    envelope BYTEA,
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    redacted_at TIMESTAMPTZ,
    PRIMARY KEY (dataset_id, server_sequence),
    UNIQUE (dataset_id, operation_id),
    CHECK ((envelope IS NULL) = (redacted_at IS NOT NULL)),
    CHECK (envelope IS NULL OR octet_length(envelope) <= 262144)
);

CREATE INDEX encrypted_operations_pull
    ON encrypted_operations (dataset_id, server_sequence);

COMMENT ON TABLE encrypted_operations IS
    'Opaque encrypted client operations. This table must never gain plaintext chart fields.';

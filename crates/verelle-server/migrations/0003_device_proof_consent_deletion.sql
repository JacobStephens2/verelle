-- Adds proof-of-possession metadata, versioned health-data consent receipts,
-- and a ciphertext-deletion manifest. No health plaintext is introduced.

ALTER TABLE account_devices
    ADD COLUMN key_algorithm TEXT NOT NULL DEFAULT 'p256_ecdsa_sha256_spki'
    CHECK (key_algorithm = 'p256_ecdsa_sha256_spki');

ALTER TABLE opaque_auth_flows
    ADD COLUMN device_id UUID,
    ADD COLUMN device_challenge BYTEA
    CHECK (device_challenge IS NULL OR octet_length(device_challenge) = 32);

CREATE TABLE auth_start_attempts (
    attempt_id BIGSERIAL PRIMARY KEY,
    identifier_hash BYTEA NOT NULL CHECK (octet_length(identifier_hash) = 32),
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX auth_start_attempts_identifier_time
    ON auth_start_attempts (identifier_hash, attempted_at DESC);

CREATE TABLE account_consents (
    account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    consent_kind TEXT NOT NULL CHECK (consent_kind = 'consumer_health_data_collection'),
    policy_version TEXT NOT NULL CHECK (octet_length(policy_version) BETWEEN 1 AND 64),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    withdrawn_at TIMESTAMPTZ,
    PRIMARY KEY (account_id, consent_kind, policy_version)
);

CREATE TABLE deletion_manifests (
    deletion_id UUID PRIMARY KEY,
    requested_account_id UUID NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ NOT NULL,
    CHECK (completed_at >= requested_at)
);

CREATE TABLE deletion_manifest_datasets (
    deletion_id UUID NOT NULL REFERENCES deletion_manifests(deletion_id) ON DELETE CASCADE,
    dataset_id UUID NOT NULL,
    PRIMARY KEY (deletion_id, dataset_id)
);

COMMENT ON TABLE account_consents IS
    'Versioned affirmative collection-consent receipts; contains no chart data.';
COMMENT ON TABLE deletion_manifests IS
    'Independent identifiers used to prevent deleted ciphertext from being resurrected by restore.';
COMMENT ON TABLE auth_start_attempts IS
    'Bounded, hashed-identifier events used only for transactional authentication rate limiting.';

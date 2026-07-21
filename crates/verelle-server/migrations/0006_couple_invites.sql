-- One-use, end-to-end encrypted couple invitations.
-- The invite secret and dataset key never reach PostgreSQL. Only a hash of a
-- domain-separated verifier and the partner's account-key ciphertext are kept.

CREATE TABLE couple_invites (
    invite_id UUID PRIMARY KEY,
    dataset_id UUID NOT NULL REFERENCES sync_datasets(dataset_id) ON DELETE CASCADE,
    created_by_account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    verifier_hash BYTEA NOT NULL CHECK (octet_length(verifier_hash) = 32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    redeemed_by_account_id UUID REFERENCES accounts(account_id) ON DELETE SET NULL,
    redeemed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    CHECK (expires_at > created_at),
    CHECK ((redeemed_by_account_id IS NULL) = (redeemed_at IS NULL))
);

CREATE UNIQUE INDEX couple_invites_one_active_per_dataset
    ON couple_invites (dataset_id)
    WHERE redeemed_at IS NULL AND revoked_at IS NULL;

CREATE INDEX couple_invites_expiry
    ON couple_invites (expires_at)
    WHERE redeemed_at IS NULL AND revoked_at IS NULL;

COMMENT ON COLUMN couple_invites.verifier_hash IS
    'SHA-256 of the client-derived invite verifier; neither the invite secret nor dataset key.';

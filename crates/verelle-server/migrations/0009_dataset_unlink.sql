-- Auditable, idempotent membership unlink and key-epoch advancement.
-- No plaintext key or health observation is represented here.

ALTER TABLE sync_datasets
    ADD COLUMN rotation_barrier_sequence BIGINT NOT NULL DEFAULT 0
        CHECK (rotation_barrier_sequence >= 0);

CREATE TABLE dataset_unlinks (
    request_id UUID PRIMARY KEY,
    dataset_id UUID NOT NULL REFERENCES sync_datasets(dataset_id) ON DELETE CASCADE,
    remaining_account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    departed_account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    old_epoch BIGINT NOT NULL CHECK (old_epoch > 0),
    new_epoch BIGINT NOT NULL CHECK (new_epoch = old_epoch + 1),
    barrier_sequence BIGINT NOT NULL CHECK (barrier_sequence >= 0),
    completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (remaining_account_id <> departed_account_id)
);

CREATE UNIQUE INDEX dataset_unlinks_one_transition ON dataset_unlinks (dataset_id, old_epoch);

COMMENT ON TABLE dataset_unlinks IS
    'Independent membership/epoch audit metadata; contains no dataset keys or health plaintext.';

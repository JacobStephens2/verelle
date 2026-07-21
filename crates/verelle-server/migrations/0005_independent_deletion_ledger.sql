-- An append-only deletion record that is intentionally independent of the
-- account/dataset tables.  It survives account and ciphertext purges and can
-- therefore be checked during restore/replay to prevent resurrection.
CREATE TABLE deletion_ledger (
    ledger_id BIGSERIAL PRIMARY KEY,
    deletion_id UUID NOT NULL UNIQUE,
    account_id UUID NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dataset_count INTEGER NOT NULL CHECK (dataset_count >= 0),
    reason TEXT NOT NULL DEFAULT 'account_erasure',
    CHECK (octet_length(reason) BETWEEN 1 AND 64)
);

CREATE TABLE deletion_ledger_datasets (
    ledger_id BIGINT NOT NULL REFERENCES deletion_ledger(ledger_id),
    dataset_id UUID NOT NULL,
    PRIMARY KEY (ledger_id, dataset_id)
);

CREATE INDEX deletion_ledger_account_time
    ON deletion_ledger (account_id, recorded_at DESC);

COMMENT ON TABLE deletion_ledger IS
    'Append-only erasure ledger with no foreign keys to user data; retained across purge and restore.';
COMMENT ON TABLE deletion_ledger_datasets IS
    'Dataset identifiers covered by a ledger entry; intentionally independent of sync_datasets.';

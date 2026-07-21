# Independent deletion ledger

Account erasure writes an entry to `deletion_ledger` and one row per affected
dataset to `deletion_ledger_datasets` in the same database transaction as the
purge. These tables deliberately do not reference `accounts` or
`sync_datasets`, so PostgreSQL cascades and ciphertext cleanup cannot remove
the evidence needed to audit a deletion or suppress data during restore.

The ledger is append-only by application contract: entries are never updated
or deleted. Restore/replay tooling must reject any operation whose dataset is
listed in the ledger (and should retain the ledger when restoring a database
backup). `deletion_manifests` remains as the API-facing completion receipt;
the independent ledger is the durable audit/control-plane record.

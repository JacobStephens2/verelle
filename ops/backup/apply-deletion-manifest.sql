\set ON_ERROR_STOP on
CREATE TEMP TABLE restored_deleted_accounts (account_id UUID PRIMARY KEY, recorded_at TIMESTAMPTZ);
CREATE TEMP TABLE restored_deleted_datasets (dataset_id UUID PRIMARY KEY, recorded_at TIMESTAMPTZ);
\copy restored_deleted_accounts FROM :'deleted_accounts_csv' WITH (FORMAT csv, HEADER true)
\copy restored_deleted_datasets FROM :'deleted_datasets_csv' WITH (FORMAT csv, HEADER true)

DELETE FROM sync_datasets
 WHERE dataset_id IN (SELECT dataset_id FROM restored_deleted_datasets);
DELETE FROM accounts
 WHERE account_id IN (SELECT account_id FROM restored_deleted_accounts);

INSERT INTO deletion_ledger (deletion_id, account_id, dataset_count, recorded_at)
SELECT gen_random_uuid(), account_id, 0, recorded_at
  FROM restored_deleted_accounts manifest
 WHERE NOT EXISTS (
   SELECT 1 FROM deletion_ledger ledger WHERE ledger.account_id = manifest.account_id
 );

#!/usr/bin/env bash
set -euo pipefail

: "${RESTORE_DATABASE_URL:?Use a dedicated, disposable RESTORE_DATABASE_URL}"
: "${BACKUP_DATABASE_DUMP:?Path to decrypted database.dump is required}"
: "${DELETED_ACCOUNTS_CSV:?Path to decrypted deleted-accounts.csv is required}"
: "${DELETED_DATASETS_CSV:?Path to decrypted deleted-datasets.csv is required}"

case "${RESTORE_DATABASE_URL}" in
  *verelle_restore*|*verelle_test*) ;;
  *) printf '%s\n' 'Refusing restore: database name must contain verelle_restore or verelle_test.' >&2; exit 2 ;;
esac

pg_restore --dbname="${RESTORE_DATABASE_URL}" --clean --if-exists --no-owner --no-acl \
  "${BACKUP_DATABASE_DUMP}"
psql "${RESTORE_DATABASE_URL}" --no-psqlrc \
  --set=deleted_accounts_csv="${DELETED_ACCOUNTS_CSV}" \
  --set=deleted_datasets_csv="${DELETED_DATASETS_CSV}" \
  --file="$(dirname "$0")/apply-deletion-manifest.sql"

psql "${RESTORE_DATABASE_URL}" --no-psqlrc --tuples-only --command \
  "SELECT CASE WHEN EXISTS (SELECT 1 FROM accounts a JOIN deletion_ledger d ON d.account_id = a.account_id) THEN 'FAIL' ELSE 'PASS' END AS deletion_manifest_reapplied"

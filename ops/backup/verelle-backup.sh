#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${VERELLE_BACKUP_BUCKET:?VERELLE_BACKUP_BUCKET is required}"
: "${VERELLE_BACKUP_AGE_RECIPIENT:?VERELLE_BACKUP_AGE_RECIPIENT is required}"

backup_work="$(mktemp -d /var/lib/verelle-backup/run.XXXXXX)"
trap 'rm -rf -- "${backup_work}"' EXIT
backup_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_prefix="verelle/${backup_stamp}"
aws_endpoint_args=()
if [[ -n "${VERELLE_BACKUP_S3_ENDPOINT:-}" ]]; then
  aws_endpoint_args+=(--endpoint-url "${VERELLE_BACKUP_S3_ENDPOINT}")
fi

pg_dump --dbname="${DATABASE_URL}" --format=custom --no-owner --no-acl \
  --file="${backup_work}/database.dump"
psql "${DATABASE_URL}" --no-psqlrc --csv --command \
  "SELECT account_id, recorded_at FROM deletion_ledger ORDER BY ledger_id" \
  > "${backup_work}/deleted-accounts.csv"
psql "${DATABASE_URL}" --no-psqlrc --csv --command \
  "SELECT dataset.dataset_id, ledger.recorded_at FROM deletion_ledger_datasets dataset JOIN deletion_ledger ledger USING (ledger_id) ORDER BY dataset.dataset_id" \
  > "${backup_work}/deleted-datasets.csv"

for artifact in database.dump deleted-accounts.csv deleted-datasets.csv; do
  age --recipient "${VERELLE_BACKUP_AGE_RECIPIENT}" \
    --output "${backup_work}/${artifact}.age" "${backup_work}/${artifact}"
  aws "${aws_endpoint_args[@]}" s3 cp --only-show-errors "${backup_work}/${artifact}.age" \
    "s3://${VERELLE_BACKUP_BUCKET}/${backup_prefix}/${artifact}.age"
done

sha256sum "${backup_work}"/*.age > "${backup_work}/SHA256SUMS"
aws "${aws_endpoint_args[@]}" s3 cp --only-show-errors "${backup_work}/SHA256SUMS" \
  "s3://${VERELLE_BACKUP_BUCKET}/${backup_prefix}/SHA256SUMS"
printf 'verelle_backup_last_success_unixtime %s\n' "$(date +%s)" \
  > /var/lib/verelle-backup/verelle-backup.prom

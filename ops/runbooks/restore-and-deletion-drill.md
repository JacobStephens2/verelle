# Restore and deletion drill

Run this quarterly and before public launch. Never target production.

1. Record the backup object prefix, Git commit, operator, and start time in the drill log.
2. Create a disposable PostgreSQL database whose name contains `verelle_restore`.
3. Download `database.dump.age`, both deletion-manifest CSV files, and `SHA256SUMS`; verify hashes before decrypting with the offline age identity.
4. Run `ops/backup/restore-drill.sh` with the four explicit environment variables. It refuses ordinary database names.
5. Require `deletion_manifest_reapplied = PASS`. Query account, dataset, operation, and deletion-ledger counts and compare them with the backup inventory.
6. Start the candidate server against the restored database, run `/readyz`, the account/sync integration suite, and a deletion request. Confirm logs contain IDs and metadata only.
7. Destroy the disposable database and decrypted files. Retain only hashes, counts, timings, command exit statuses, and corrective actions.

The drill fails if any deleted account/dataset resurfaces, readiness fails, a plaintext observation appears in logs or PostgreSQL, or the complete exercise takes more than four hours.

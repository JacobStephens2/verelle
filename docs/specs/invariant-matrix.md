# Shared lifecycle invariant matrix

Status: implementation draft. “Implemented” means repository code/tests exist;
it does not close OQ-9/OQ-10 or authorize production use.

| ID | Invariant | Schema/code owner | Verification | Status |
|---|---|---|---|---|
| SYNC-I1 | local operation + materialization + outbox commit atomically | `verelle-store` schema v1 | injected outbox failure rolls all rows back | implemented |
| SYNC-I2 | push retry uses immutable op ID | sync/relay contract | response-loss retry, exact queued-ciphertext retry, duplicate local append, blind relay model | client/model implemented; production relay pending |
| SYNC-I3 | HLC + device ID (+ defensive op ID) deterministic merge | `verelle-sync` | permutations, edit/delete race, three-device set | implemented |
| SYNC-I4 | pull application and cursor watermark commit atomically | `verelle-store` schema v1 | invalid page rollback; pull echo; `BEGIN IMMEDIATE` writer-contention test | implemented |
| SYNC-I5 | redacted sequence gaps advance via authenticated watermark | store/relay/deletion manifest | redacted-gap store and blind relay tests; deletion E2E | client/model implemented; production relay pending |
| SYNC-I6 | durable clock seed survives restart/skew | operations HLC columns | reopen max-version test; skew unit test | implemented |
| SYNC-I7 | relay never decrypts or merges | server boundary | blind relay model; dependency/code review; plaintext grep | reference model implemented; production relay pending |
| SYNC-I8 | civil dates never re-bucket | `verelle-core` record key | golden/property fixtures | implemented |
| SYNC-I9 | stale epoch rejected; queue re-encrypted atomically | membership + outbox | complete-set replacement, mixed-epoch rejection, offline/replay integration scenario | client/model implemented; lifecycle review/server pending |
| SYNC-I10 | operation count and ciphertext bytes are bounded | client transport + server relay | zero/oversize/shape/epoch rejection; page-limit tests | client/model implemented; production relay pending |
| KEY-I1 | server never receives reusable password/data secret | reviewed PAKE | protocol vectors and external review | blocked OQ-9 |
| KEY-I2 | auth and data wrapping domains are separated | `verelle-crypto` | Argon2/HKDF separation test | primitive implemented; design review pending |
| KEY-I3 | health envelope binds version/epoch/couple/op | crypto/sync | wrong key/epoch/context + transport ID tests | implemented |
| KEY-I4 | unlink atomically revokes member and advances epoch | server membership transaction | offline/restored/replay adversarial suite | pending server/OQ-9 |
| KEY-I5 | recovery cannot be performed by operator support | account API/UI | recovery-code + partner-share E2E | primitive only; OQ-9 pending |
| KEY-I6 | local-to-account import never deletes sole good copy | client import journal | crash at every stage | pending platform client |
| KEY-I7 | watch is independently enrolled/revocable | device schema | watch quick-record/revoke tests | specified; Phase 8 |
| DEL-I1 | single deletion leaves winning tombstone but redacts prior ciphertext | client + server + manifest | local plaintext purge; redacted-gap bootstrap/restart integration; restore-oldest-backup pending | client/model implemented; OQ-10/server/restore drill pending |
| DEL-I2 | unlink is immediate but cannot retract downloaded history | membership/UI | two-device unlink test + copy review | specified; OQ-9/OQ-10 pending |
| DEL-I3 | one-account deletion does not silently erase other subject | server deletion workflow | shared-dataset scenario suite | blocked OQ-10 |
| DEL-I4 | couple destruction follows reviewed shared-subject policy | deletion workflow | dual/single requester E2E | blocked OQ-10 |
| DEL-I5 | restore always reapplies independent manifest before traffic | infra/runbook | quarterly oldest-backup drill | specified; Phase 3 infra pending |
| DEL-I6 | processor copies/tokens follow deletion | jobs/processor APIs | processor receipt/status checks | blocked OQ-10/integration |
| DISPLAY-I1 | no computed fertility/day status exists in v1 core | `verelle-core` | API review + explicit-anchor fixture | implemented |
| DISPLAY-I2 | Peak counts require user-marked anchor | chart layout | monitor-Peak-without-anchor test | implemented |
| DISPLAY-I3 | chart layout is stable for any observation input order | chart layout | property and golden suites | implemented |

## Sign-off record

- Engineering author review: pending.
- Certified instructor chart-format review (A-4): pending.
- Applied-cryptography review (OQ-9): pending.
- Privacy-counsel parameters (OQ-10): pending.
- Phase 7 legal copy/annotation review (OQ-3): pending.

No blank row is implicitly approved. The production server, external beta, and
real-data restore drill remain downstream of the named gates.

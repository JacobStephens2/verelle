# Data inventory, deletion, and retention

Status: **draft; OQ-10 privacy-counsel parameters are open.** This is an
engineering data map, not legal advice or a published policy. Cross-references:
plan FR-11/NFR-10, [sync](sync-state-machine.md),
[key lifecycle](key-membership-lifecycle.md), [matrix](invariant-matrix.md).

## Server-visible inventory

| Datum/store | Subjects | Plain/cipher | Purpose | Draft retention/deletion |
|---|---|---|---|---|
| account ID, normalized email, timestamps | account holder | plain metadata | login/account | account life; remove on account deletion, manifest ID retained |
| PAKE registration record, wrapped account blobs | account holder | opaque cryptographic metadata | authentication/recovery | account life; revoke/replace on password change, remove on deletion |
| hashed session, device ID/public key | account holder/device user | plain/opaque metadata | access control | session expiry or device/sign-out deletion |
| couple ID and two-member graph | both partners | plain metadata | authorization | dataset life; unlink history retained only in 24-month audit event |
| wrapped couple keys + epoch | both partners/devices | ciphertext/metadata | E2EE membership | remove unauthorized wraps immediately; remaining historical wraps per dataset life |
| encrypted operation, op ID, seq, epoch, byte size, received time | both partners; charting person may be primary subject | ciphertext + metadata | blind sync/backup | dataset life; redact per observation/dataset deletion |
| cursor/request timing | account/device | metadata | sync delivery/security | avoid durable per-request storage; logs 30 days |
| push token/provider/device | account/device | plain secret metadata | opaque invalidation | sign-out, device removal, invalid token, account deletion |
| Stripe customer/subscription IDs, entitlement/grace/lapse dates | subscriber | metadata; Stripe holds payment data | billing | statutory/accounting needs per counsel; no payment card data in Verelle |
| deletion request/manifest scope IDs and timestamps | requesting subject + affected shared dataset | identifiers only | non-resurrection proof | indefinite draft retention; counsel must confirm minimization |
| audit event type, account/couple IDs, timestamp | affected accounts | metadata | security/compliance | 24 months draft |
| service logs/metrics | accounts indirectly | scrubbed metadata | reliability/security | 30 days logs; aggregate metrics avoid subject IDs |
| encrypted PostgreSQL backup | all active subjects | ciphertext + metadata | disaster recovery | rolling 30-day expiry; manifest reapplied on restore |

All of the above is treated operationally as consumer health data because
account existence and couple/sync metadata are health-revealing. Request/response
bodies, email addresses, push tokens, auth material, and ciphertext are excluded
from application logs. There are no advertising, analytics, or tracking SDKs.

## Processor/recipient map

| Party | Data | Required control/action |
|---|---|---|
| DigitalOcean | server disks, database/backups, IP/traffic metadata | DPA/security terms; live deletion and backup expiry; incident contact |
| off-droplet backup destination (TBD) | encrypted DB backups and metadata | provision only after inventory/DPA review; 30-day lifecycle |
| Stripe | email/billing/customer/subscription/payment data | processor terms; deletion/retention API mapping; no health observations |
| Apple APNs | token, app/account association by inference, ping timing | opaque payload only; invalid-token cleanup |
| Google FCM | token, app/account association by inference, ping timing | opaque payload only; invalid-token cleanup |
| Apple/Google stores | purchase/account/device/crash metadata under their policies | declarations aligned to published policy; store-native crash data only |
| Cloudflare/Porkbun | DNS and traffic metadata as configured | no health application payload at registrar; proxy decision documented |

Counsel must confirm processor/third-party characterization, contracts,
flow-down language, request forwarding, and statutory deadlines before sign-off.

## Four deletion operations

### 1. Delete one observation

The client first commits a winning encrypted tombstone for the logical record.
It identifies every known superseded `op_id` for that record and sends an
authenticated redaction request. The server transaction appends/accepts the
tombstone, deletes the targeted ciphertext bytes from live operation storage,
and writes a manifest containing only couple ID, op IDs, request/authentication
time, live-applied time, and backup horizon. Sequences remain allocated; pull
watermarks safely cross the gaps (SYNC-I5). The tombstone stays for convergence.

Every device eventually deletes superseded local plaintext operations after it
has applied the tombstone and retained only the minimum tombstone state. An
offline device may hold a prior copy until it reconnects; product copy must say
this honestly. Export produced after deletion excludes the observation.

### 2. Unlink a couple

Unlink executes the key lifecycle immediately. It is an authorization/key event,
not retroactive erasure: both people may already possess historical plaintext.
Future server access and new-epoch data stop for the departed member. Either
person may separately request deletion of their account metadata or, subject to
the shared-data ownership rule below, the whole server dataset.

### 3. Delete one account

Authenticate in-app (recovery/device proof as required), cancel sessions/push
tokens, and unlink first if a second member remains. Delete the account’s email,
PAKE record, device records, account key wraps, billing linkage as legally
permitted, and processor copies; record a minimized manifest/audit event. The
other member’s account and their lawful copy of shared chart history are not
silently destroyed. Exact treatment of jointly controlled ciphertext is OQ-10.

### 4. Destroy the whole couple dataset

Default draft policy: require both active members’ confirmation within a bounded
window; if only one account remains or the other cannot respond, apply the
counsel-approved data-subject rule rather than denying a statutory request. On
approval, revoke all dataset access, delete encrypted ops/wrapped couple keys/
push associations from live stores, cancel dataset entitlement, and manifest
all identifiers for backup reapplication. This shared-ownership rule is not
final until OQ-10.

## Manifest and restore algorithm

The deletion manifest is append-only, access-controlled, backed up separately,
and contains no chart plaintext/ciphertext. Every destructive request has an
idempotency ID and state: `authenticated → live_applied → processors_notified →
backup_horizon_elapsed → complete`.

Restore to a fresh database is never exposed to application traffic until:

1. restore backup and verify integrity;
2. load the latest manifest from the independent copy;
3. delete/redact every matching account, couple, wrapped-key, token, session,
   billing linkage, and op ID;
4. reapply current membership/epoch revocations;
5. run non-resurrection assertions and record counts only;
6. open traffic after an operator sign-off record.

The quarterly drill restores the oldest retained backup and proves a fixture
deleted after that backup cannot be fetched, authenticated, or decrypted through
server-returned material. Drill data is synthetic.

## Draft retention schedule

- Active ciphertext: dataset life, subject to the four deletion operations.
- Lapsed paid-sync ciphertext: 7-day grace, retain 12 months with two warnings,
  then dataset deletion/manifest flow. Local apps keep working.
- Backups: automatic 30-day rolling expiry; never extend a backup to evade a
  deletion request.
- Audit events: 24 months. Logs: 30 days. Invalid/sign-out push tokens: immediate
  cleanup. Deletion manifest identifiers: indefinite draft retention.
- Stripe/accounting records: counsel/accounting-defined minimum; do not copy
  full payment details into Verelle.

OQ-10 must confirm live-system deadline, backup deadline/statutory ceiling,
shared-subject handling, legal holds, identity/authentication evidence, minors,
processor flow-down, HBNR mapping, and whether indefinite manifest retention is
appropriately minimized. The published policy and UI cannot precede that review.


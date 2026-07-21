# Real-data readiness handoff

Date: 2026-07-19 UTC

Scope: colocated `verelle.app` web and Axum/PostgreSQL deployment

Operator: Jacob Stephens (`jacob@stephens.page`)

## Outcome

The web account path is implemented for founder verification: affirmative
consumer-health-data consent, OPAQUE registration/login, a browser-held P-256
device key with proof of possession, pinned OPAQUE server key, end-to-end
encrypted synchronization, authenticated logout, and authenticated whole-account
deletion.

This is a material improvement over the OQ-9 activation baseline, but it is not
yet a general production or external-beta readiness verdict. The narrow usable
surface is one account on its originally enrolled browser. The UI explicitly
states that new-device and lost-browser recovery are not ready.

## Implemented controls

- The password is processed by the pinned RFC 9807 OPAQUE profile and is not sent
  to or retained by the server.
- Registration binds the OPAQUE upload, client-chosen device ID, and dataset ID
  to a P-256 ECDSA proof. Login requires both OPAQUE password authentication and
  a fresh server challenge signed by that enrolled device.
- The browser private signing key and AES vault key are non-extractable WebCrypto
  keys stored in IndexedDB. Chart operations are encrypted before sync; the
  server schema contains ciphertext and bounded metadata, not observation
  plaintext.
- The OPAQUE server public key is pinned in the encrypted browser vault after
  registration and checked on login.
- Registration requires an unchecked-by-default affirmative consent control
  tied to policy version `2026-07-19`. The server rejects absent, false, or
  mismatched consent and stores a versioned receipt.
- Authentication starts are transactionally limited to 10 per credential
  identifier per 15 minutes. Only hashed identifiers are retained for the
  rolling limiter and records older than 24 hours are pruned on use.
- Account deletion requires a valid bearer session, removes the sole-member
  dataset and all encrypted operations in the same transaction, cascades account
  credentials/devices/sessions/wraps/consent, and leaves identifier-only deletion
  receipts.
- The web deployment has a same-origin API, CSP, no third-party scripts,
  no analytics SDK, no advertising SDK, no location/camera/microphone access,
  and 14-day Apache log rotation.
- The distinct Consumer Health Data Privacy Policy is published from the
  homepage and names the collected categories, purposes, sources, processors,
  sale/sharing posture, rights channels, deletion, withdrawal, and appeal path.
- Authoritative Porkbun DNS points at the DigitalOcean origin. During deployment,
  a recursive resolver still returned the prior Cloudflare edge addresses and
  Cloudflare injected seven-day network-error reporting; the consent and policy
  therefore disclose Cloudflare as a transient processor during propagation.

## Verification evidence

- Workspace format, strict Clippy, and unit/doc suites passed.
- Disposable-PostgreSQL account/sync test passed with migration 3. It exercises:
  rejected false consent, rejected forged device proof, successful OPAQUE
  registration, successful password plus device-proof login, transactional rate
  limiting, encrypted push/pull/decrypt, account deletion, and deletion-manifest
  persistence.
- The production database contained zero accounts and zero encrypted operations
  before this migration/deployment.
- The existing nightly database job uploaded the first Verelle logical dump to
  off-DigitalOcean S3 at
  `stephens/postgres/verelle/verelle-20260719-101000.sql.gz`. Object metadata
  reports S3 `AES256` server-side encryption.
- That exact object was streamed into a fresh PostgreSQL database with
  `ON_ERROR_STOP=1`; migrations 1 and 2 and the expected zero account/operation
  counts were restored successfully. The disposable database was then removed.
- A live headless-Chrome run against the DigitalOcean origin completed OPAQUE
  registration, browser P-256 proof, recovery-code acknowledgement, encrypted
  cycle-start recording and sync, logout, password-plus-device relogin, and
  authenticated account deletion. Chrome reported no page or console errors.
- That live run exposed and closed an IndexedDB completion-listener race before
  the final pass. Three interrupted `.invalid` harness accounts were removed
  with the same sole-member deletion transaction and manifest records; they held
  no health data. The successful harness account deleted itself through the
  public API. Final live counts were zero accounts, datasets, operations,
  sessions, and consent rows, with the identifier-only deletion manifests
  retained.

## Residual gates and risks

1. **Recovery is not executable.** Registration generates a high-entropy
   recovery code and server-side recovery wrap, but there is no recovery or
   new-device enrollment endpoint/UI. Losing or clearing the enrolled browser
   can make chart data permanently inaccessible.
2. **Export is absent from the web UI.** Whole-account deletion works, but the
   consumer access/portable export path still requires operator handling.
3. **Email ownership is not verified.** An external/public signup could claim an
   email address it does not control. Do not open registration to external beta
   users until email verification or a reviewed invitation design exists.
4. **The deletion ledger is not independent enough.** The live deletion manifest
   is in the same PostgreSQL database. The completed restore drill proves backup
   usability, but it does not prove that restoring a backup from before a later
   deletion cannot resurrect ciphertext. An independent ledger plus a
   delete-then-oldest-backup restore drill remains required.
5. **Privacy-counsel gate OQ-10 is open.** The policy and consent surface implement
   the current factual data inventory and statutory mechanics, but they have not
   been reviewed by privacy counsel. This handoff is not legal advice.
6. **Android account enrollment is not implemented.** The Android app remains a
   synthetic local-recording build; its sync worker only operates after a
   separately provisioned enrollment.
7. **Operational launch work remains.** The incident-response/breach-notification
   runbook and tabletop, backup freshness alert, independent deletion replay,
   email verification, Android/iOS store declarations, and external-beta gates
   are not complete.

## Readiness verdict

**Ready for the operator to verify the complete web registration/login/sync/delete
flow with non-health test entries. Not yet approved for external users or an
unqualified real-health-data claim.** A founder-only real-data decision would
need explicit acceptance of at least the recovery/export, unverified-email,
independent-deletion-ledger, and OQ-10 gaps above; the earlier OQ-9 waiver does
not accept them.

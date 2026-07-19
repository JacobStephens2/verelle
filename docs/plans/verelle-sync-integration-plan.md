# Plan: Verelle household sync integration

## 1. Summary

Connect the Android and web local-first clients to the existing blind relay through a
versioned same-origin `/api/v1` contract. The household deployment is colocated on the
Stephens Page host with Axum bound to loopback and Apache terminating TLS. Browser encrypted
storage is complete. On 2026-07-19 the owner waived independent OQ-9 review and authorized
incomplete public API activation; real-data and household-release gates remain open.

## 2. Outcome and requirements

### Success metrics

- Baseline: no connected clients. Target: two founding devices converge on one encrypted
  observation within 10 seconds of foreground reconnect, measured across 20 foreground syncs
  before household daily use. Owner: Jacob.
- Baseline: no restore drill. Target: a fresh-host PostgreSQL restore plus deletion-manifest
  replay passes before any real health data is uploaded.

### Functional requirements

- **FR-S1:** clients commit observations locally and remain usable with no network.
- **FR-S2:** clients push immutable encrypted operations with stable operation IDs and pull by
  a durable cursor.
- **FR-S3:** the relay authorizes dataset membership, validates envelope shape/epoch/limits, and
  never decrypts or merges observations.
- **FR-S4:** Android and web apply identical deterministic merge and response-loss behavior.
- **FR-S5:** account enrollment, session, device membership, recovery, and epoch rotation use the
  reviewed OQ-9 lifecycle; no temporary credential scheme is allowed.

### Nonfunctional requirements

- **NFR-S1:** zero acknowledged local-write loss across process death, response loss, retries,
  and cursor restart; verified by the model and two-client crash suite.
- **NFR-S2:** server stores ciphertext and bounded metadata only; SQL/request logs contain no
  request bodies, credentials, or chart fields; verified by schema and log review.
- **NFR-S3:** API is loopback-bound, same-origin proxied, TLS-only externally, and fails closed
  when review configuration is absent.
- **NFR-S4:** sync p95 remains below 300 ms at 100 concurrent synthetic clients on the colocated
  host; verified by the pre-beta k6 gate.

### Non-goals

Computed fertility/status interpretation, plaintext server storage, unauthenticated sync,
browser plaintext persistence for real data, public beta, billing, and watch clients are out of
this integration.

## 3. Design decisions

- **Colocation:** accepted in [ADR 0005](../adrs/0005-colocated-household-api.md) for the
  household MVP. Alternatives were a dedicated droplet or a managed API/database; colocation
  is reversible and is revisited before closed beta or the load gate.
- **Transport:** versioned JSON carrying base64url opaque authentication messages and encrypted
  envelopes. Shared `verelle-api` prevents Android/web/server drift.
- **Authentication:** RFC 9807 OPAQUE through the exact `opaque-ke` pin. Independent OQ-9
  review was [waived by the owner](../reviews/oq9-owner-waiver-2026-07-19.md) for incomplete
  public activation; the security findings and real-data restrictions remain open.
- **Browser storage:** the synthetic preview now uses encrypted IndexedDB with a non-extractable
  WebCrypto key. Reviewed account-key custody and recovery remain prerequisites to real web use.

## 4. Architecture

The Rust core/store owns operations, materialization, outbox, HLC, and cursor. UniFFI exposes
the native boundary to Android. Leptos/WASM uses the shared core and a browser transport. The
Axum service owns account/session authorization and blind PostgreSQL relay persistence. Apache
proxies `/api/v1` over HTTPS to loopback `127.0.0.1:3035`; it never exposes the Rust listener.

The trust boundary is: device/browser keyring → encrypted envelope → authenticated API → blind
relay. The server may see account/session metadata, dataset identifiers, operation IDs, epochs,
sizes, timing, and sequences, but not chart records or keys. Threats include credential attack,
dataset enumeration, replay/conflict injection, request flooding, host compromise, and restore
resurrection. Controls are OPAQUE/session hashes, membership authorization, stable operation IDs,
epoch barriers, body/response limits, rate limits, least-privilege PostgreSQL, no-body logs,
independent backups, and a restore/deletion drill.

## 5. Delivery phases

1. **Colocated foundation (complete):** ADR, PostgreSQL role/database, restricted systemd
   service, loopback bind, Apache same-origin proxy, health/readiness, and fail-closed public
   routes. Gate: service active, listener loopback-only, `/api/v1` returns structured
   `blocked_oq9`, Apache config passes.
2. **Protocol and relay interop (complete):** shared wire types, authenticated Axum router,
   synthetic authorizer tests, push/pull/idempotency/cursor integration. Gate: workspace tests,
   ignored PostgreSQL relay test, and synthetic HTTP round-trip.
3. **OQ-9 review (owner-waived for public activation):** an independent applied-cryptography
   review was not performed. Jacob Stephens explicitly accepted the documented gaps. The
   independent review remains recommended and the waiver does not close real-data gates.
4. **Account/device lifecycle:** enable reviewed OPAQUE, session revocation, device enrollment,
   couple membership, recovery, epoch rotation, rate limits, and audit events. Gate: adversarial
   key-lifecycle suite.
5. **Android transport (implementation complete; acceptance open):** typed outbox/cursor
   pull/push records are exposed through UniFFI and a foreground-triggered WorkManager worker
   uses HTTPS with retry/backoff. Keystore-protected enrollment keeps it dormant until review.
   Gate: two Android devices converge with response loss and process death.
6. **Web durable storage and transport (implementation complete; acceptance open):** synthetic
   state is encrypted in IndexedDB under a non-extractable WebCrypto key; legacy plaintext is
   migrated and removed; reviewed-session sync orchestration compiles behind the gate. Gate:
   account enrollment plus web ↔ Android crypto/merge interop; no plaintext health fields.
7. **Operations:** independent encrypted PostgreSQL backups, restore/deletion drill, metrics,
   rate/load tests, and incident runbook. Gate: NFR-S2/NFR-S4 and restore criteria pass.
8. **Enablement (owner-authorized exception):** public activation was explicitly authorized
   before gates 4–7, with known gaps. Deploy, smoke-test, and monitor. Rollback is reverting the
   environment flag and service binary; data migrations remain additive.
9. **Household release:** install the Android build, enroll both devices, run the two-phone gate,
   and begin real-data use only after all gates are logged.

## 6. Validation and operations

Unit tests cover wire bounds, OPAQUE messages, envelope validation, merge, cursor, and epoch
rules. Integration tests cover PostgreSQL idempotency/conflicts/redaction and authenticated HTTP.
End-to-end tests cover two clients, offline writes, response loss, retries, process death, and
restore/replay. Load tests use 100 synthetic clients and assert p95 <300 ms. Apache/systemd
health and readiness are monitored; logs are JSON and body-free. Backups are encrypted,
independent, and restored before real data use.

## 7. Risks and pre-mortem

- OQ-9 redesign invalidates the wire/auth schema: the owner accepted this risk for public test
  activation; keep the contract versioned and disable the flag immediately if a review rejects it.
- Browser key handling regresses or same-origin code is compromised: keep account enablement
  blocked, retain strict CSP, and run the ciphertext/legacy-removal browser test per release.
- Shared-host contention causes sync latency or outages: measure resource use and revisit OQ-7
  before beta.
- A restore resurrects deleted ciphertext: require manifest reapplication in the restore gate.

## 8. Open questions

- **OQ-9, Jacob + qualified reviewer:** independent review remains open; the owner waiver removed
  it only as a public-reachability blocker, not as a real-data or production-readiness gate.
- **OQ-10, Jacob + privacy counsel:** deletion/retention parameters; blocks real-data backup,
  restore, and public beta.
- **Browser account-key custody, Jacob + OQ-9 reviewer:** connect the encrypted local vault to the
  reviewed account/recovery lifecycle; blocks web real-data use.
- **Android account enrollment, Jacob + OQ-9 reviewer:** install reviewed dataset/session material
  into the existing Keystore-protected worker path; blocks the two-phone gate.

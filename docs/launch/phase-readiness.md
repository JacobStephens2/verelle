# Phase 1–8 readiness ledger

Status date: 2026-07-20. This ledger distinguishes implemented software from acceptance evidence. A phase is not “complete” merely because its code compiles.

## Current outcome

The Android, iOS, web, Wear OS, and watchOS surfaces are implemented; `verelle.app` and the household encrypted relay are deployed. Production is intentionally empty after deletion-manifest cleanup of the synthetic prelaunch account. Subscription enforcement remains off.

| Phase | Engineering state | Acceptance state | Remaining gate |
|---|---|---|---|
| 1 — chart core | Implemented: complete v1 observation vocabulary, mechanical chart layout, fixture CLI, golden/property tests | Automated gate green | Certified instructor review against real charts |
| 2 — Android skeleton | Implemented: every v1 entry, chart, Keystore-backed local persistence, export, deletion, reminders, ARM64/x86_64 builds and emulator tests | Not accepted | Record a real day on the Android phone; measure cold start under 2 seconds; manually verify reminder delivery and storage-exhaustion behavior |
| 3 — household service | Partly implemented and deployed: OPAQUE accounts/recovery, device proof, encrypted relay, couple invitation/redemption, crash-safe unlink with atomic membership revocation/epoch advance and historical client keyrings, per-observation and account deletion, 5-second foreground polling/freshness, TLS, database migrations, off-host backup, IaC/runbooks/alerts | Real-Postgres account/invite/unlink/relay tests green; response-loss and old-epoch client tests green; backup and production health green | Extend recovery-code enrollment to return/import every historical epoch after a rotation; add APNs/FCM token registry and opaque background invalidation; externally review the lifecycle; run two-real-phone p95 test, restore/deletion drill, authenticated 100-VU k6 profile, and OQ-9/OQ-10 reviews |
| 4 — iOS | Implemented to Android v1 observation/account/sync/deletion parity; watch app embeds correctly | iPhone/watch simulator build and unit test green | Daily use and full account/couple interop on the available physical iPhone |
| 5 — web | Implemented and deployed: local encrypted mode, account/recovery, all v1 entries, chart, couple sharing, redaction, export, billing UI, 5-second polling and freshness | Browser acceptance and wasm/native tests green; OQ-8 closed | Verify a phone-written production account on web using synthetic data, then delete it |
| 6 — payments | Implemented behind a disabled gate: Stripe Checkout, signed/idempotent webhooks, ordered lifecycle, entitlement/grace/pause/refund, warning queue, one-year ciphertext deletion and tests; OQ-5 closed | Deterministic lifecycle tests green | Supply Stripe test credentials/prices; exercise real test-mode purchase→webhook→lapse/refund; connect and verify warning-email delivery; only then enable enforcement |
| 7 — launch | Draft privacy policy, store declarations/listing, beta runbook, incident response, IaC and operations package exist | Not accepted and not authorized for public launch | OQ-3 legal/trademark/feature review, OQ-10 privacy parameters, Institute outreach, named backup operator, incident tabletop, live store-console declarations, signing/provisioning, 10–20-couple closed beta, crash/NFR results, and ship decision |
| 8 — watches | Implemented: Wear OS app, recent/quick record, tile, complication; embedded watchOS recent/quick record | Android APK and iPhone+watch simulator build green | Implement the independently revocable server-enrolled watch-child key path; run round-trip tests on Samsung Watch8 and Apple Watch |

## Deliberate stop conditions

- Do not claim Phase 3 accepted or invite real health data until rotated-epoch recovery is implemented and the unlink/key lifecycle has passed external applied-cryptography review.
- Do not enable billing enforcement until Stripe test-mode lifecycle and warning delivery both pass.
- Do not submit stores or begin closed beta until the Phase 7 legal, privacy, incident, and declaration gates close.
- Do not describe the watch bridge as independently enrolled until watch child-device credentials and revocation exist on the server.

## Verification already completed

- Full Rust formatting, clippy, unit/property/golden suites; web native and wasm builds.
- Android phone and Wear OS debug builds plus Android unit tests.
- iPhone app with embedded watchOS app installs in the simulator and its unit test passes.
- Browser local-mode record, same-day rerender, delete, and default-form behavior checked with no console errors.
- Isolated PostgreSQL integration: OPAQUE account/authenticated encrypted sync, single-use couple invite, idempotent unlink/session revocation/epoch advance, and blind relay idempotency/redaction/stale-epoch behavior.
- Production pre-deploy encrypted backup; migrations 6–9; public `/healthz` and `/readyz`; CSP-verified static web/privacy deployment; OPAQUE setup rotation; synthetic-data deletion ledger.

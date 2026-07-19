# Android local-recording verification report

Audit date: 2026-07-19 (UTC)

## Outcome

The earlier fixture-only Android architecture spike now has a crash-safe local
recording slice. The Compose screen records synthetic cycle starts and monitor
readings through UniFFI. Rust owns hybrid-clock advancement, SQLite
materialization, AES-256-GCM envelope creation, and the durable pending outbox.

Android generates one random 256-bit local data key, wraps it with an
AES-256-GCM key held by Android Keystore, and persists only the wrapped key and
random IV in private, backup-excluded preferences. Losing the Keystore wrapping
key fails closed instead of silently creating a new key over an existing
database.

The surface remains record-and-display only. It contains no computed fertility
status, window, day classification, eligibility logic, or guidance.

## Verification

| Gate | Result |
|---|---|
| `cargo test -p verelle-ffi` | PASS; persistent reopen and wrong-key cases included |
| strict `verelle-ffi` clippy | PASS |
| `assembleDebug` and test APK | PASS; four Android ABIs |
| `lintDebug` | PASS; zero errors |
| API 35 `connectedDebugAndroidTest` | PASS; 4 tests |
| Keystore wrapped-key recreation | PASS on emulator |
| Rust repository reopen | PASS; chart and encrypted outbox retained |
| Actual force-stop/cold relaunch | PASS; cycle, Low reading, and 2 pending ops reappeared |

The headless API 35 ATD emulator reported cold-start `TotalTime` values of
approximately 3.3–3.4 seconds. That is diagnostic only. NFR-5 explicitly
requires less than 2 seconds on the founding member's mid-range physical Android
phone, so the acceptance gate remains open until the prepared APK is measured
there.

## Deliberately open

- Only synthetic data is authorized. Export and recovery are not ready.
- Reminder scheduling and a complete chart presentation remain pending.
- Schema/process-death injection beyond repository reopen remains pending.
- Real-phone recording and cold-start measurement remain pending.
- OQ-9/OQ-10, instructor chart review, production signing, Play distribution,
  and every cloud/deployment gate remain open.

See [the phone-install handoff](android-phone-install.md) for the exact next
physical-device steps.

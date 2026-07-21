# Linux Android architecture-spike report

Audit date: 2026-07-19 (UTC)

## Scope

This report follows the Mac readiness handoff and the OQ-2 decision to build the
Phase 2 walking skeleton on Android first. The implemented unit is a bounded
architecture spike, not the complete Phase 2 surface or acceptance gate.

The spike adds:

- a typed `verelle-ffi` UniFFI boundary over golden-fixture replay;
- a workspace-pinned binding generator and reproducible `cargo-ndk` script;
- native libraries for `arm64-v8a`, `armeabi-v7a`, `x86`, and `x86_64`;
- a minimal Android/Compose screen rendering dates, cycle days, recorded marker
  types, and explicit P/P+1/P+2/P+3 annotations from the regular-cycle fixture;
- an emulator instrumentation test that verifies Kotlin receives the compact
  chart structure produced by Rust.

The surface remains record-and-display only. It contains no fertility status,
window, day classification, eligibility logic, or guidance.

## Host readiness used

- JDK: OpenJDK 21.0.11
- Android SDK: platforms 34, 35, and 36; build tools 34, 35, and 36
- Android emulator: 36.6.11; API 35 x86_64 image
- Android NDK used: 28.2.13676358
- Rust Android targets: aarch64, armv7, i686, and x86_64
- `cargo-ndk`: installed

The agent process did not initially inherit Jacob's `kvm` supplementary group,
although Jacob is a member. Launching the emulator through `sg kvm` supplied the
already-authorized group for this process; no host permission was changed.

## Verification

| Command/gate | Result |
|---|---|
| `cargo fmt --all -- --check` | PASS |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | PASS |
| `cargo test --workspace --locked` | PASS; 27 tests, including 2 new FFI tests |
| `./gradlew assembleDebug` | PASS; APK built with all four native ABIs |
| `./gradlew lintDebug` | PASS; zero findings |
| `./gradlew connectedDebugAndroidTest` | PASS; 1 test on API 35 x86_64 ATD emulator |
| Visual launch smoke check | PASS for Verelle content; an unrelated stale AVD produced Android system-app ANR overlays |

The instrumentation assertion covers the fixture start date, method-cycle
number, monitor and user-marked-Peak marker row, and P/P+3 annotations. No fatal
Verelle exception appeared in logcat during the visual check.

## Gates deliberately left open

This does not close Phase 2. The app still needs a record screen, crash-safe
local-store integration, schema migration/device crash injection, CSV/JSON
export UI, reminders, a complete chart presentation, real-device recording,
and the measured real-device cold-start gate. OQ-9, OQ-10, the instructor
chart-format review, and every cloud/deployment gate also remain open.

No production data, account/auth implementation, sync service, cloud API call,
credential access, signing change, or infrastructure mutation was used.

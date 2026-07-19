# Verelle

Verelle is a local-first, record-and-display chart for couples using the
Marquette Method. The v1 core records observations and lays them out as a chart;
it deliberately does **not** compute fertility status, fertile windows, day
classifications, or conception guidance.

The repository currently contains the shared foundation plus verified Android,
web, and gated-server walking slices from
[the delivery plan](docs/plans/verelle-plan.md):

- `verelle-core`: observation vocabulary, cycle bookkeeping, mechanical
  user-marked Peak counts, JSON/CSV export, and golden chart rendering;
- `verelle-crypto`: versioned AES-256-GCM envelopes, epoch/context binding,
  Argon2id/HKDF separation primitives, and offline recovery-code material;
- `verelle-sync`: encrypted immutable operations, HLC ordering, tombstones,
  deterministic client-side merge, transport validation, and a blind relay
  reference model for idempotency/epoch/redaction contracts;
- `verelle-store`: SQLite migrations, atomic operation/materialization/outbox
  commits, transactional pull watermarks, durable HLC seed, and epoch requeue;
- `verelle-ffi`: the typed UniFFI boundary used by native platform shells;
- `verelle-cli`: fixture replay, validation, and local-store export;
- `android/`: an Android/Compose local-recording app backed by Rust SQLite,
  encrypted pending operations, an Android-Keystore-wrapped data key, and a
  reviewed-session-gated WorkManager sync transport;
- `verelle-web`: a Leptos CSR app that records synthetic facts in the browser,
  persists them as AES-GCM ciphertext in IndexedDB under a non-extractable
  WebCrypto key, renders charts through the shared Rust core, and includes the
  reviewed-session-gated sync transport;
- `verelle-server`: an Axum/Postgres service with liveness/readiness, RFC 9807
  OPAQUE account/session routes, and authenticated opaque relay persistence;
- `docs/specs`: the Phase S lifecycle drafts and shared invariant matrix.

Jacob Stephens explicitly waived the independent OQ-9 review requirement for
incomplete public API activation on 2026-07-19. That owner decision does not
close the known cryptographic/lifecycle findings or authorize real health data.
Account-key recovery, client enrollment, billing, export/recovery, reminders,
OQ-10, and remaining infrastructure remain downstream. The current apps accept
synthetic test data only.

## Run it

Requires Rust 1.88 or newer.

```sh
cargo test --workspace
cargo run -p verelle-cli -- validate-fixtures fixtures
cargo run -p verelle-cli -- chart fixtures/regular-cycle.json
cargo run -p verelle-cli -- export-fixture fixtures/regular-cycle.json csv
```

The Android spike requires JDK 17+, Android SDK 36, an Android NDK, and the four
Rust Android targets. Point `ANDROID_HOME` and `ANDROID_NDK_HOME` at those tools,
then build or test from `android/`; Gradle invokes the workspace-pinned UniFFI
generator and `cargo-ndk` automatically:

```sh
cd android
./gradlew assembleDebug
./gradlew connectedDebugAndroidTest
```

The Android app records and persists synthetic cycle starts and monitor readings
through the shared Rust store. Its sync worker stays dormant until reviewed
account credentials are enrolled. It does not yet export/recover data, schedule
reminders, or satisfy the Phase 2 real-device acceptance gate. See
[the phone-install handoff](docs/handoffs/android-phone-install.md).

Build the Leptos app with stable Trunk 0.21:

```sh
cd crates/verelle-web
trunk build --release
trunk serve
```

Run the gated server foundation against an empty Postgres database:

```sh
DATABASE_URL=postgresql://localhost/verelle_dev \
  cargo run -p verelle-server
curl http://127.0.0.1:3000/healthz
curl http://127.0.0.1:3000/readyz
```

The server binds to loopback by default. Mounting account/session/sync routes
requires an OPAQUE server setup, an immutable approval-or-waiver reference, and
the explicit reviewed-API environment flag. The colocated deployment has an
owner waiver for public reachability but is not approved for real data.

Before committing, run the same checks as CI:

```sh
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --locked
```

The chart output is deterministic and independent of wall-clock time. A
monitor-displayed Peak does not create a `P` annotation; only an explicit
`user_marked_peak` observation does.

## Repository status

This is pre-release health-adjacent software. Public API reachability is an
owner-accepted incomplete test deployment, not a production-readiness claim. Do
not entrust real data to it until client enrollment, the pending reviews,
instructor chart review, backup/deletion drill, and launch criteria are complete.

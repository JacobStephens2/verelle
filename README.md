# Verelle

Verelle is a local-first, record-and-display chart for couples using the
Marquette Method. The v1 core records observations and lays them out as a chart;
it deliberately does **not** compute fertility status, fertile windows, day
classifications, or conception guidance.

The repository currently contains the implementation-ready foundation from
Phases 0, S, and 1 of [the delivery plan](docs/plans/verelle-plan.md):

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
- `android/`: an Android/Compose architecture spike that renders the regular
  golden fixture through generated Kotlin bindings and native Rust libraries;
- `docs/specs`: the Phase S lifecycle drafts and shared invariant matrix.

Production account auth, PostgreSQL relay, native/web shells, billing, and
infrastructure intentionally remain downstream of the external OQ-9/OQ-10
reviews and platform decision named in the plan. The lifecycle drafts do not
claim those gates are closed.

## Run it

Requires Rust 1.85 or newer.

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

The spike uses fixture data only. It does not yet record data, persist data,
schedule reminders, or satisfy the Phase 2 real-device acceptance gate.

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

This is pre-release health-adjacent software. Do not entrust real data to it or
deploy a production sync service until the pending external reviews, instructor
chart review, platform shells, backup/deletion drill, and launch criteria in the
plan are complete.

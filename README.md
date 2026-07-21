# Verelle

Verelle is a local-first, record-and-display chart for couples using the
Marquette Method. The v1 core records observations and lays them out as a chart;
it deliberately does **not** compute fertility status, fertile windows, day
classifications, or conception guidance.

The repository currently contains the implementation-ready foundation from
Phases 0, S, and 1 of [the delivery plan](docs/plans/verelle-plan.md):

- `verelle-core`: validated observation vocabulary, cycle bookkeeping,
  mechanical user-marked Peak counts, JSON/CSV export, and golden chart
  rendering;
- `verelle-crypto`: versioned AES-256-GCM envelopes, epoch/context binding,
  Argon2id/HKDF separation primitives, and offline recovery-code material;
- `verelle-sync`: encrypted immutable operations, HLC ordering, tombstones,
  deterministic client-side merge, bounded transport validation, and a blind
  relay reference model for idempotency/epoch/redaction contracts;
- `verelle-store`: SQLite migrations, immediate atomic
  operation/materialization/outbox commits, transactional pull watermarks,
  durable HLC seed, all-or-nothing epoch requeue, and acknowledged-redaction
  plaintext compaction;
- `verelle-cli`: fixture replay, validation, local-store chart rendering, and
  local-store export;
- `verelle-ffi`: typed UniFFI chart and crash-safe local-store APIs for native
  shells;
- `apps/android`: the Android-first Compose walking skeleton with Keystore-
  wrapped local keys, persistent recording, chart display, deletion, export,
  reminders, and ARM64/x86_64 device tests;
- `docs/specs`: the Phase S lifecycle drafts and shared invariant matrix.

The integration suite drives three independent SQLite clients through encrypted
push/pull, response loss, restart/bootstrap, edit/delete races, redaction, and
epoch rotation. These are client/reference-model proofs; they do not substitute
for the gated production relay or external lifecycle reviews.

Production account auth, PostgreSQL relay, the iOS/web shells, billing, and
infrastructure intentionally remain downstream of the external OQ-9/OQ-10
reviews and later phases named in the plan. The lifecycle drafts do not claim
those gates are closed.

## Run it

Requires Rust 1.85 or newer.

```sh
cargo test --workspace
cargo run -p verelle-cli -- validate-fixtures fixtures
cargo run -p verelle-cli -- chart fixtures/regular-cycle.json
cargo run -p verelle-cli -- export-fixture fixtures/regular-cycle.json csv
cargo run -p verelle-cli -- chart-store path/to/verelle.sqlite
```

Before committing, run the same checks as CI:

```sh
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --locked
```

Android prerequisites and build/device-test commands are in
[`apps/android/README.md`](apps/android/README.md).

The chart output is deterministic and independent of wall-clock time. A
monitor-displayed Peak does not create a `P` annotation; only an explicit
`user_marked_peak` observation does.

## Repository status

This is pre-release health-adjacent software. Do not entrust real data to it or
deploy a production sync service until the pending external reviews, instructor
chart review, platform shells, backup/deletion drill, and launch criteria in the
plan are complete.

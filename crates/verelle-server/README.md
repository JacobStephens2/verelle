# Verelle server foundation

This crate contains the Postgres-backed blind-relay persistence boundary and an
Axum process with only two public routes:

| Route | Purpose |
|---|---|
| `GET /healthz` | process liveness; does not require Postgres |
| `GET /readyz` | readiness; returns 503 unless Postgres answers |

Every other route returns 404 in the default fail-closed mode. The crate now
contains RFC 9807 OPAQUE account/session flows and authenticated blind-sync
routes, but the production binary mounts them only when the OQ-9 deployment
gate below is satisfied.

## Local run

Create an empty development database using your normal local Postgres role, then
run:

```sh
DATABASE_URL=postgresql://localhost/verelle_dev cargo run -p verelle-server
```

The process applies its embedded migration, disables SQL statement logging,
emits JSON operational logs, and binds to `127.0.0.1:3000` unless
`VERELLE_BIND_ADDRESS` is set.

The ignored integration test requires an isolated, disposable database:

```sh
TEST_DATABASE_URL=postgresql://localhost/verelle_test \
  cargo test -p verelle-server --test postgres_relay -- --ignored
```

The relay table contains only dataset/operation identifiers, sequence and epoch
metadata, ciphertext, and timestamps. Logical record keys, civil dates,
readings, observations, and chart values have no columns and must never be added.

## Public API activation gate

`VERELLE_REVIEWED_API_ENABLED=true` is accepted only when both a valid
`VERELLE_OPAQUE_SERVER_SETUP` and nonempty `VERELLE_OQ9_REVIEW_REFERENCE` are
present. The reference must identify either an independent review record or an
explicit owner waiver. The colocated deployment uses the documented 2026-07-19
owner waiver for incomplete public activation; this does not make it suitable
for real health data. See
[`ADR 0003`](../../docs/adrs/0003-production-auth-gated.md),
[`ADR 0005`](../../docs/adrs/0005-colocated-household-api.md), and
[`deploy/systemd`](../../deploy/systemd).

# ADR 0005: colocate the household API on the Stephens Page host

- Status: accepted for the household MVP
- Date: 2026-07-19
- Source: plan D10 / OQ-7

## Decision

Run the Phase 3 household API on the existing `stephens.page` host instead of
provisioning a dedicated droplet. Apache terminates TLS for `verelle.app` and
proxies `/api/v1` to a Verelle systemd service bound only to loopback. PostgreSQL
uses a dedicated database and least-privilege login role. The service does not
share application credentials, writable directories, or database ownership with
another site on the host.

The API is not mounted merely because the service exists. Production account and
sync routes remain fail-closed until ADR 0003's OQ-9 authentication gate is
recorded as reviewed, browser storage is encrypted, and the deployment gate is
green. Health and readiness checks may be exercised locally during preparation.

## Isolation and operations

- Bind Axum to a dedicated `127.0.0.1` port; never publish the Rust listener.
- Run under a dedicated system identity with systemd filesystem, privilege, and
  resource restrictions.
- Keep the database password in a root-readable environment file and disable SQL
  statement logging so account identifiers and ciphertext are not copied into
  logs.
- Terminate TLS and enforce request-size/time limits in Apache before proxying.
- Use a same-origin `/api/v1` prefix for the web app and Android. This avoids a
  broad CORS policy and leaves one certificate/hostname boundary.
- Back up the Verelle database independently and prove restore before real data.
- Reuse fleet monitoring without exporting account identifiers or request bodies.

## Consequences

Colocation avoids another monthly service and is sufficient for the two-person
household gate. It accepts a larger blast radius: an operating-system or Apache
incident involving another hosted application can affect Verelle availability,
and host resource contention can affect latency. Database/application identities
reduce but do not eliminate that risk.

Revisit this decision before the Phase 7 closed beta, or earlier if the host
cannot meet the 100-concurrent-user load gate, resource isolation is noisy, or a
security review recommends a single-purpose host. Moving later is reversible
because DNS/TLS terminate above a stateless service and PostgreSQL is the only
server-side state.

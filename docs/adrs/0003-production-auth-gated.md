# ADR 0003: production authentication remains gated

- Status: provisional, blocked by OQ-9
- Date: 2026-07-18
- Source: plan D5/D8 and Phase S

## Decision

Do not add plaintext password submission or a home-grown challenge-response
endpoint merely to scaffold the Axum server. The candidate production path is a
published augmented PAKE with Argon2id and domain-separated auth/wrapping
material, subject to the applied-cryptography review recorded by OQ-9.

## Consequences

The workspace implements envelope, KDF-separation, recovery, sync, and store
primitives but no production account server. That prevents a temporary insecure
scheme from becoming a compatibility or migration obligation.


# ADR 0003: public authentication requires an explicit review record

- Status: accepted; amended by owner waiver on 2026-07-19
- Date: 2026-07-18
- Source: plan D5/D8 and Phase S

## Decision

Do not add plaintext password submission or a home-grown challenge-response
endpoint merely to scaffold the Axum server. The candidate production path is a
published augmented PAKE with Argon2id and domain-separated auth/wrapping
material, subject to the applied-cryptography review recorded by OQ-9.

## Consequences

At the time of this decision, the workspace implemented envelope,
KDF-separation, recovery, sync, and store primitives but no production account
server. That prevented a temporary insecure scheme from becoming a compatibility
or migration obligation.

## 2026-07-19 owner-waiver amendment

The repository now contains the candidate OPAQUE account server. Jacob Stephens
explicitly waived the independent OQ-9 requirement and authorized enabling the
incomplete public API despite the documented gaps. The deployment must reference
the immutable [owner waiver](../reviews/oq9-owner-waiver-2026-07-19.md).

This amendment changes public reachability only. It does not declare an
independent cryptographic review complete, close the packet findings, authorize
real health data, or relax the remaining lifecycle and operational gates.

# OQ-9 OPAQUE adoption assessment

- Status: **candidate selected; external application review still open**
- Date: 2026-07-19
- Scope: account registration/login and password-derived account-key wrapping

## Candidate

Adopt RFC 9807 OPAQUE-3DH through an exact pin to `opaque-ke` 4.0.1, using:

- Ristretto255 for the OPRF and 3DH group;
- SHA-512 for the 3DH hash;
- Argon2id v1.3 as the client-side key-stretching function;
- TLS 1.3 as the confidential registration transport;
- explicit client identity (normalized account identifier), server identity
  (`verelle.app`), and protocol context (`verelle/auth/v1`);
- the library's dummy-login path for unknown identifiers;
- server-static-key consistency checks on every client after enrollment;
- opaque random application sessions whose SHA-256 hashes, not bearer values,
  are stored server-side.

No password, password-equivalent `auth_key`, OPAQUE export key, account data key,
couple key, or recovery code may be submitted to or logged by the server.

## Evidence and limits

RFC 9807 is the CFRG consensus specification published in July 2025 and includes
byte-level test vectors and implementation safeguards:
<https://datatracker.ietf.org/doc/html/rfc9807>.

The `opaque-ke` maintainers state that the current implementation is based on
RFC 9807, document Ristretto255/3DH and Argon2 support, and publish the client and
server registration/login APIs:
<https://docs.rs/opaque-ke/4.0.1/opaque_ke/>.

The project also records an NCC Group audit performed in June 2021. That audit
covered release 0.5.0 and its fixes landed in 1.2.0:
<https://github.com/facebook/opaque-ke#readme>. It does **not** by itself cover
4.0.1 or Verelle's identities, session binding, recovery, device enrollment,
key wrapping, rate limits, or persistence.

Therefore this document selects the implementation candidate but does not claim
OQ-9 sign-off. A qualified reviewer must examine the exact pin, parameters,
protocol transcript binding, application state machines, recovery interaction,
test vectors, and deviations before public account/sync routes are mounted.

## Required sign-off record

Record reviewer, qualifications, date, reviewed commit, threat model, exact
dependency lock entries, Argon2 parameters and device measurements, server-key
custody, key-wrap format, recovery design, downgrade/version policy, RFC vectors,
application E2E vectors, findings, and accepted deviations. Until that record is
complete, deployments must report authentication as `blocked_oq9` and keep sync
routes unavailable from the public virtual host.

# OQ-9 external applied-cryptography review packet

- Prepared: 2026-07-19 UTC
- Status: **prepared for external delivery; not reviewed, approved, or signed**
- Implementation target: `be5546b5d0c39f888a9db6654b163193041e9936`
- Packet/specification target: the immutable commit or archive supplied with
  this packet when a reviewer is engaged; no delivery reference exists yet
- Repository: `https://github.com/JacobStephens2/verelle`
- Requested reviewer: a qualified applied-cryptography reviewer independent of
  the implementation
- Delivery status: no reviewer identity or contact channel has been supplied, so
  this packet has not been transmitted

This packet requests an adversarial application-level review of Verelle's RFC
9807 OPAQUE candidate, its account-key wrapping boundary, and the surrounding
account/session design. Passing tests and using an audited dependency are not
treated as OQ-9 approval. The public API must remain `blocked_oq9` until a signed
review record closes every blocking finding and the downstream lifecycle gates
are implemented.

After this packet was prepared, Jacob Stephens explicitly waived the independent
review requirement for incomplete public activation. That
[owner waiver](oq9-owner-waiver-2026-07-19.md) overrides the activation stop in
the preceding paragraph only; it does not resolve or accept findings on behalf
of an independent reviewer. This packet remains open for external review.

## Review request and boundaries

Please review implementation code at the exact implementation target, not the
moving `main` branch. Review this packet and the corrected lifecycle spec from
the immutable packet delivery reference. Evaluate whether the design maintains
these invariants against a
malicious network, credential database theft, account enumeration, transcript
replay or mix-up, compromised application server, malicious relay, lost device,
and attempted support/operator recovery:

1. The server never receives or can derive a reusable password, OPAQUE export
   key, account data key, dataset key, recovery code, or observation plaintext.
2. OPAQUE identities, context, KSF, suite, and server static key are bound and
   pinned correctly across registration and login.
3. Authentication output and account-key wrapping are domain-separated.
4. Unknown-account, wrong-password, replay, expired-flow, rate-limit, device
   enrollment, and session-revocation paths fail safely without useful oracles.
5. Password change, recovery, device enrollment/revocation, couple linking,
   unlink/epoch rotation, and local-to-account import can be completed without
   introducing an operator recovery key or silent data loss.
6. Dependency pedigree and the application's use of `opaque-ke` 4.0.1 are
   acceptable for a two-person household deployment before any wider beta.

The current implementation covers the OPAQUE/account/session candidate and a
blind single-owner sync round trip. It does not yet implement the full lifecycle
listed in item 5. A review may approve a narrow primitive/profile while still
rejecting OQ-9 as a whole; please make that scope distinction explicit.

## Exact profile under review

| Item | Selected value |
|---|---|
| Specification | RFC 9807 OPAQUE-3DH |
| Rust implementation | exact direct pin `opaque-ke = 4.0.1`, features `argon2`, `std` |
| OPRF group | Ristretto255 |
| Key exchange | TripleDH over Ristretto255 |
| 3DH hash | SHA-512 |
| KSF | Argon2id v1.3; 65,536 KiB memory, 3 iterations, parallelism 1, library-selected output length |
| Client identity | 32-byte SHA-256 of a trimmed, ASCII-lowercased account identifier whose input is at most 254 bytes |
| Server identity | ASCII `verelle.app` |
| Login context | ASCII `verelle/auth/v1` |
| Randomness | `rand::rngs::OsRng` |
| Server key check | client compares the static server public key learned at registration on every login |
| Export-key derivation | HKDF-SHA-256, salt `verelle/opaque-export/v1`, info `account-data-key-wrap`, 32-byte output |
| Application session | independent random 32-byte bearer; only SHA-256 token hash stored; 30-day expiry |
| Registration transport | Apache currently accepts TLS 1.2 and TLS 1.3 for `verelle.app`; minimum-version policy requires review |

The normalized email is sent to the account-start endpoints over TLS and then
stored only as its SHA-256 hash. Because an email hash is dictionary-guessable,
it is metadata minimization rather than anonymization.

### Locked dependency evidence

The target commit's `Cargo.lock` records:

| Package | Version | crates.io checksum |
|---|---:|---|
| `opaque-ke` | 4.0.1 | `ded22991b43cd15561b62b2e1cf9ace1344a8534eebec96202d5c96a77a6616a` |
| `voprf` | 0.5.0 | `28f59c30c76e2fea54cdece6a054e2662feffa7ab19658a7887524265ee39470` |
| `curve25519-dalek` | 4.1.3 | `97fb8b7c4503de7d6ae7b42ab72a5a59857b4c937ec27a3d4539dba95b5ab2be` |
| `argon2` | 0.5.3 | `3c3610892ee6e0cbce8ae2700349fcf8f98adb0dbfbee85aec3c9179d29cc072` |
| `hkdf` | 0.12.4 | `7b5f8eb2ad728638ea2c7d47a21db23b7b58a72ed6a38256b8a1849f15fbbdf7` |
| `sha2` | 0.10.9 | `a7507d819769d01a365ab707794a4084392c824f54a7a6a7862f8c3d0892b283` |

Please verify the entire transitive tree with `cargo tree -p verelle-auth
--locked`; this table highlights the profile-defining packages rather than
claiming they are the only security-relevant dependencies.

## Adjacent cryptographic formats

`verelle-crypto` wraps 256-bit account/dataset keys with AES-256-GCM. The binary
envelope is `VRL1 || version || key_epoch || 96-bit random nonce || ciphertext
and tag`; AAD repeats `VRL1`, the version, epoch, and caller-supplied context.
Current key-wrap contexts are `account/password-wrap`,
`account/recovery-wrap`, and `dataset/account-wrap`.

Recovery codes are 32 random bytes rendered as unpadded base64url. HKDF-SHA-256
uses salt `verelle/recovery/v1`, info `account-data-key-wrap`, and a 32-byte
output. The recovery code and derived key are client-only by design.

The separate `derive_account_secrets` Argon2id/HKDF helper predates OPAQUE. It is
not used by the account transcript and must not become a parallel authentication
scheme. Please advise whether it should be removed or renamed to eliminate
misuse risk.

## Code and design inventory

Review at least these paths. Use the implementation target for code and the
packet delivery reference for review/specification documents:

- `Cargo.toml`, `Cargo.lock`, `crates/verelle-auth/Cargo.toml`
- `crates/verelle-auth/src/lib.rs` — exact suite, transcript calls, identities,
  context, KSF, server-key comparison, export-key derivation, zeroization
- `crates/verelle-api/src/lib.rs` — bounded wire types and account/sync routes
- `crates/verelle-server/src/accounts.rs` — flows, dummy login, sessions,
  device and dataset authorization, rate limits, error mapping
- `crates/verelle-server/src/config.rs`, `crates/verelle-server/src/main.rs`, and
  `crates/verelle-server/src/lib.rs` —
  fail-closed enablement and route mounting
- `crates/verelle-server/migrations/0002_accounts_and_sessions.sql` — retained
  authentication metadata and database constraints
- `crates/verelle-server/tests/account_sync_http.rs` — full synthetic transcript
  through authenticated ciphertext push/pull and session revocation
- `crates/verelle-crypto/src/lib.rs`, `crates/verelle-sync/src/lib.rs`, and
  `crates/verelle-store/src/lib.rs` — key wraps, health envelopes, merge/outbox
- `docs/specs/key-membership-lifecycle.md`, `sync-state-machine.md`, and
  `invariant-matrix.md` — intended lifecycle and explicit pending invariants
- `android/app/src/main/kotlin/app/verelle/SyncEnrollmentStore.kt` and
  `SyncHttpClient.kt` — dormant Keystore-protected bearer storage and transport
- `crates/verelle-web/src/encrypted_storage.js` and `sync_runtime.rs` — encrypted
  browser vault and dormant reviewed-session transport
- `deploy/apache/verelle.app-le-ssl.conf` and
  `deploy/systemd/server.env.example` — TLS boundary and disabled flag

## Known gaps requiring reviewer disposition

These are disclosed findings, not assumed acceptable deviations:

1. Android and web do not yet expose OPAQUE registration/login or install a
   reviewed enrollment. Android's sync worker and the browser sync runtime stay
   dormant.
2. The server static key comparison exists in `verelle-auth`, but durable client
   pin storage, replacement UX, backup, rotation, and compromise recovery are
   not implemented.
3. `device_public_key` is currently bounded opaque bytes. Registration does not
   prove possession, login does not require a device-key signature, and the
   concrete device key algorithm/attestation policy is unresolved.
4. Password change, recovery execution, additional-device enrollment, couple
   invite/link, partner sharing, unlink/epoch advance, and account deletion are
   specified but not implemented end to end.
5. The application suite tests successful registration/login, wrong password,
   changed server key, serialization, normalization, export separation, and a
   PostgreSQL-backed HTTP round trip. It does not yet carry an independently
   checked copy of the RFC 9807 byte-level vectors.
6. Rate limiting is ten starts per identifier hash per fifteen minutes. There is
   no IP/global limiter, cleanup job, or distributed abuse control, and the
   database count/insert is not an atomic quota reservation.
7. The server setup is loaded from a protected environment file. Formal key
   generation ceremony, off-host backup, access log, rotation, and disaster
   recovery are not documented or tested.
8. Registration conflict reveals that an identifier already exists. Login uses
   the library's dummy-password-file path for unknown accounts, but application
   timing/enumeration measurements have not been performed.
9. OPAQUE server flow state is stored for five minutes and registration flow
   state for ten. Expiry enforcement exists, but cleanup and replay/parallel
   request stress tests are incomplete.
10. The browser vault key is non-extractable at rest, but same-origin script can
    invoke it. CSP reduces exposure; it does not make an XSS-compromised origin
    safe.

Please add any further findings and classify each as blocker, high, medium, low,
or informational. A blocker/high finding cannot be accepted solely because the
deployment is initially limited to one household.

## Reproduction and evidence

From the target commit with Rust 1.88+, PostgreSQL, Android SDK/NDK, Java, and a
WASM toolchain available:

```sh
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
cargo test -p verelle-server --test account_sync_http \
  opaque_account_and_authenticated_http_sync_round_trip -- --ignored --exact
cargo test -p verelle-server --test postgres_relay \
  postgres_relay_preserves_blind_idempotent_cursor_semantics -- --ignored --exact
NO_COLOR=false trunk build --release
cargo clippy -p verelle-web --target wasm32-unknown-unknown --locked -- -D warnings
ANDROID_NDK_HOME=/path/to/ndk android/gradlew -p android \
  :app:assembleDebug :app:assembleDebugAndroidTest :app:lintDebug \
  :app:connectedDebugAndroidTest
```

The two ignored tests require an isolated disposable `TEST_DATABASE_URL` and
must never target a shared or production database.

Evidence recorded on 2026-07-19 UTC:

- Both isolated PostgreSQL tests passed; the disposable role/database were
  removed afterward.
- Full workspace format, strict clippy, and tests passed.
- Android API 35 build, lint, and all five connected tests passed.
- The live web build rendered with zero browser errors, persisted seven
  synthetic facts through reload, stored a non-extractable `CryptoKey` and
  ciphertext in IndexedDB, and retained no legacy plaintext/session key.
- `https://verelle.app/api/v1/status` returned HTTP 404 with
  `authentication: blocked_oq9` and `sync_api: disabled`.

These results demonstrate implementation consistency, not protocol security or
lifecycle approval.

## Required signed output

Please return one Markdown or signed PDF record containing:

- reviewer name, relevant qualifications, organization/independence, contact,
  review date, and reviewed commit;
- verdict: `approved`, `approved with conditions`, or `not approved`, with the
  exact scope of that verdict;
- confirmed threat model and any excluded threats;
- confirmed dependency versions/checksums and review of upstream audit pedigree;
- accept/reject disposition for suite, identities, context, Argon2 parameters,
  server-key handling, export-key derivation, key wraps, recovery, session
  binding, device proof, rate limits, and downgrade/version policy;
- RFC/application-vector evidence and commands/results independently run;
- numbered findings with severity, exploit narrative, required remediation, and
  retest requirement;
- every accepted deviation, its rationale, owner, expiry/revisit date, and
  compensating control;
- an explicit statement whether OQ-9 is closed, narrowly approved but still
  open, or rejected.

Engineering will copy that artifact into `docs/reviews/`, link its immutable
reference through `VERELLE_OQ9_REVIEW_REFERENCE`, implement and retest required
changes, and only then consider enabling reviewed routes. Merely filling the
environment variable is not approval.

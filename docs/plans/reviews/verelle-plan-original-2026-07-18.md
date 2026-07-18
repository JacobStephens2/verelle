# Plan: Verelle

*Author: Jacob Stephens, drafted 2026-07-18 from docs/verelle.md (commit 5e31a4b). External claims verified 2026-07-18 unless noted. This plan is the input to an adversarial review; nothing below is sacred.*

## 1. Summary

Verelle is a cross-platform charting app for couples using the Marquette Method of natural family planning: one Rust protocol engine behind native shells (Kotlin/Jetpack Compose on Android, Swift/SwiftUI on iOS, Leptos on web, watches after 1.0), a Rust + Axum sync server over PostgreSQL, and end-to-end encryption so the server only ever stores ciphertext. The smallest version that delivers real value is the founding couple charting daily on their own two phones with shared visibility and zero data loss - everything after that (web, second store, payments, watches) is expansion. The plan retires the two riskiest bets first: the correctness of the protocol engine (Phase 1, pinned by an instructor-reviewed conformance corpus) and the Rust-core-to-native-shell architecture (Phase 2, a walking skeleton on the first phone). This is the same product posture as Chart35 (chart35.com, my Creighton Model app) applied to the Marquette Method, with the three-implementations charting engine consolidated into one Rust engine.

## 2. Outcome and requirements

### Intended outcome

A couple can run the Marquette Method day to day - record the monitor reading and supplemental markers, see today's fertility status, and both see the same chart - on whatever device is in reach, offline, without surrendering plaintext health data to any server, including mine. Target users: instructed Marquette Method couples, starting with my own household, then the broader Marquette community (instructor-referred couples, the method's active online groups).

### Success metrics (post-launch value, distinct from the launch criteria in §6)

| ID | Metric | Baseline | Target | Measurement window |
|---|---|---|---|---|
| M1 | Founding couple records daily observations with zero lost entries, and the engine's fertility-status output is confirmed correct by their Marquette instructor | none measured | ≥ 60 consecutive days, 0 lost observations, instructor sign-off | within 3 months of the Phase 3 acceptance gate |
| M2 | External weekly-active accounts | 0 | ≥ 25 | within 3 months of public launch (Phase 7) |
| M3 | Active paid subscriptions | 0 | ≥ 20 | within 6 months of payments launch (Phase 6) |

M1 is the kill-or-continue gate for public investment: if my own household will not use it daily, nobody else will.

### Functional requirements

- **FR-1** Create an account (email + password) and sign in on any supported platform. Local-only use without an account works on every platform (account-optional, the Chart35 posture).
- **FR-2** Record a daily Clearblue Fertility Monitor reading (Low / High / Peak) against a date. The observation model must also accept quantitative hormone readings (numeric E3G / LH values) so Mira-class monitors can be added without a schema migration (see D3 and OQ-6).
- **FR-3** Record supplemental markers per date: LH test strip result, bleeding/menstruation, intercourse, optional mucus observation, optional temperature, free-text note.
- **FR-4** Cycles start on the first day of true menses; current and historical cycles are viewable.
- **FR-5** Compute and display today's fertility status (fertile / infertile / learning-phase) and the current cycle's fertile-window bounds per the published Marquette Model algorithm (source of rules: the Boland Institute's published model, https://www.marquette.edu/nursing/institute-natural-family-planning/model.php, transcribed into a spec and reviewed by a certified instructor - Phase 1 gate).
- **FR-6** Support the Marquette postpartum/breastfeeding protocol in addition to regular cycles. Which protocol ships first is gated on OQ-2 (which protocol the founding couple needs at first use).
- **FR-7** Couple sharing: link exactly two accounts by invite code; both partners read and write the shared chart with per-entry attribution; unlink takes effect immediately and revokes the departing partner's future access.
- **FR-8** Multi-device sync for one account and across the linked couple, offline-first: every client is fully functional with no network and reconciles when connectivity returns.
- **FR-9** Cycle chart visualization: monitor readings plus markers per cycle, in a form an instructor can read during a follow-up.
- **FR-10** Local reminder notification for the monitor testing window.
- **FR-11** Data export (CSV and JSON) from any client, and full account + server-data deletion from within the app (Apple requires in-app account deletion, App Store Review Guideline 5.1.1(v); WA MHMDA requires deletion rights).
- **FR-12** Freemium billing: local single-user use is free forever; sync, couple sharing, and encrypted backup require a subscription paid via Stripe (settling to the Stephens Page LLC Mercury account). Entitlement is enforced server-side.
- **FR-13** Watch apps (Wear OS, watchOS): today's status at a glance and quick-record of the monitor reading. Post-1.0.

### Nonfunctional requirements

- **NFR-1** Recording an observation succeeds with zero network connectivity, 100% of the time; nothing recorded locally is ever lost by a later sync.
- **NFR-2** Zero-knowledge server: all health observations are encrypted on-device (AES-256-GCM envelope, versioned format) before upload; encryption keys never leave clients; the server can produce only ciphertext plus account metadata under any compulsion.
- **NFR-3** Couple propagation: an observation recorded on one partner's online device is visible to the other partner's online device in ≤ 10 s at p95.
- **NFR-4** Sync API p95 latency < 300 ms at 100 concurrent users on a 2 GB DigitalOcean droplet (k6, measured before public launch).
- **NFR-5** Cold start to the record screen < 2 s on a mid-range Android phone.
- **NFR-6** Durability: nightly encrypted PostgreSQL backups shipped off-droplet, with a restore drill demonstrated before household daily use begins and re-run quarterly.
- **NFR-7** Engine correctness: 100% pass on a conformance corpus of golden vectors derived from the published protocol and reviewed by a certified Marquette instructor; the corpus runs in CI on every commit.
- **NFR-8** Infrastructure cost ≤ $20/month pre-revenue (excludes the $99/yr Apple Developer fee and one-time $25 Play fee).
- **NFR-9** No third-party analytics, advertising, or tracking SDK in any client, ever (the FTC's Premom enforcement is the named cautionary case - https://www.ftc.gov/news-events/news/press-releases/2023/05/ovulation-tracking-app-premom-will-be-barred-sharing-health-data-advertising-under-proposed-ftc, verified 2026-07-18). Push notifications carry opaque "sync now" payloads only, never health data.

### Non-goals (v1.0)

- Perimenopause protocol, and full Mira quantitative protocol support (data model accepts the readings; the protocol logic is v1.1+, OQ-6).
- Sympto-thermal or Creighton method support - Chart35 already serves Creighton; Verelle stays Marquette-only.
- HealthKit / Health Connect integration.
- Instructor portal, in-app messaging, or any marketplace.
- AI/ML cycle prediction of any kind. The engine is the published deterministic protocol, full stop.
- Desktop apps, localization beyond English, and non-US storefronts at launch (expansion revisited post-1.0; GDPR work deferred with it).
- Pregnancy-mode tracking (a likely v1.x feature; deferred).

### Constraints and assumptions

Constraints:

- **C-1** Solo developer, nights-and-weekends hours, competing directly with my day job and the active job-search workstream in career-advancement-plan.md. Sustained capacity is realistically 5-10 focused hours/week, and some weeks it is zero.
- **C-2** My 2026 career plan (Decision 4, 2026-06-10) currently rules: "no new side project ships for 12 months." Verelle-the-shipped-product conflicts with it head-on. Planning does not. Resolving this is OQ-1 and it gates Phase 1, not Phase 0.
- **C-3** Stack directions fixed by docs/verelle.md: Rust core, Rust + Axum server, PostgreSQL, UniFFI bindings, Kotlin/Compose and Swift/SwiftUI shells, Leptos-or-TypeScript web, domain verelle.app, Stripe → Mercury, GitOps on GitHub Actions + OpenTofu + Ansible + DigitalOcean + Cloudflare DNS + Porkbun.
- **C-4** Regulated-adjacent domain: FTC Health Breach Notification Rule applies to fertility apps (Premom, above); Washington's My Health My Data Act (ch. 19.373 RCW, in force 2024-03-31, private right of action) applies to any WA consumer's data; Apple 5.1.1(v) requires in-app account deletion.
- **A-1** The founding couple are the first two users; their phones and their operative protocol at first use decide platform order and Phase 1 protocol priority (OQ-2).
- **A-2** Mac access is sufficient for iOS/watchOS builds and submission (the Chart35 arrangement).
- **A-3** The Clearblue Fertility Monitor remains purchasable (in stock at major retailers, verified 2026-07-18; Walgreens has delisted it - watch item, feeds OQ-6).
- **A-4** A certified Marquette instructor is available to review the golden vectors, commissioned if necessary (budget ≤ $200).

## 3. Design decisions

**D1 - Product posture: charting tool for instructed couples, not a contraceptive medical device.** Alternatives: (a) pursue FDA clearance as a "software application for contraception" (21 CFR 884.5370, Class II - the Natural Cycles De Novo, DEN170052, https://www.accessdata.fda.gov/cdrh_docs/pdf17/DEN170052.pdf, verified 2026-07-18); (b) charting tool that records observations and computes the published protocol, positioned for use alongside a certified instructor, like every existing Marquette app (Marquette NFP Pro, Femme, Read Your Body). Chosen: (b). Rationale: (a) required a 15,570-woman clinical dataset; a solo side project cannot fund that path, and the incumbent charting apps demonstrate (b) is a viable posture. Consequence: marketing copy never claims contraceptive efficacy; the app presents protocol output as charting per the user's instruction. **Gated:** a legal review of the marketing copy and disclaimers before store submission (OQ-4, blocks Phase 7).

**D2 - Greenfield Rust core rather than extending the Chart35 estate.** Alternatives: (a) build Marquette support into Chart35's existing TypeScript/Swift/Kotlin three-implementation stack and Node sync server; (b) greenfield one-Rust-core architecture per docs/verelle.md. Chosen: (b), per explicit product-doc direction, with the conflict recorded rather than hidden: (a) is the boring default and would reuse a proven zero-knowledge sync layer, an existing store presence, and real users. What decides (b): docs/verelle.md names the Rust stack as an explicit goal, Cascade already proved one-Rust-core-many-shells for me, and consolidating three engine implementations into one is the architectural lesson Chart35 taught. The Chart35 designs (conformance corpus, zero-knowledge sync, provider-share filtering) carry over as designs, not code. OQ-1 revisits this if the career-plan conflict resolves toward "fold into Chart35."

**D3 - One Rust engine, pinned by a conformance corpus.** The Marquette protocol rules live in exactly one place: the `verelle-core` crate, compiled natively for Android/iOS via UniFFI and to wasm for web. Golden vectors (observation sequences → expected daily status) are stored as data (`corpus/`), derived from the published Boland Institute model and instructor-reviewed, and run in CI. This is Chart35's conformance-corpus idea with the N-implementations problem removed structurally. The observation value type is a tagged enum carrying either categorical (Low/High/Peak) or quantitative (numeric E3G/LH) readings from day one, so Mira support is additive (FR-2, OQ-6).

**D4 - Storage: SQLite in the core on every client; PostgreSQL on the server.** Client store: rusqlite inside `verelle-store`, one schema for all platforms. Server: PostgreSQL (product-doc direction) holding accounts, entitlements, and opaque encrypted sync records. Alternative considered: SQLite server-side (Chart35 does this) - rejected in favor of the doc's direction; Postgres also gives me streaming backups and the fleet's existing postgres_exporter.

**D5 - End-to-end encryption, zero-knowledge server.** Alternatives: (a) plaintext-on-server, enabling server-side computation; (b) client-side encryption, server stores ciphertext only. Chosen: (b), the Chart35 premise carried forward. Rationale: fertility data is the exact class of data that made Premom an FTC action and motivated WA MHMDA; a server that cannot read the data is the strongest control against breach, subpoena, and my own future temptation to add analytics. Consequence accepted: "server-side features" in the freemium tier are constrained to blind services - encrypted sync relay, encrypted backup, couple key exchange, entitlements. No server-side cycle computation, ever. Key design: Bitwarden-style split derivation (Argon2id from passphrase → separate auth hash and data key, an upgrade from Chart35's PBKDF2-600k), per-couple shared data key wrapped for each partner, recovery code offered at signup. A partner holding the couple key is also a recovery path - couple sharing doubles as backup. **Gated:** the couple key-exchange and unlink/re-key design gets a written design doc reviewed before implementation (Phase 3 gate).

**D6 - Web: Leptos, behind a time-boxed spike.** Alternatives: (a) TypeScript + wasm-bindgen around the Rust engine (larger ecosystem, my deepest platform); (b) Leptos (https://leptos.dev, active and stable in the 0.7+ line, verified 2026-07-18), where the engine links into the same wasm module with no JS binding layer. Chosen: (b), per the product doc's stated intent to try Leptos, **gated** by a 3-day spike (Phase 5): render a chart from engine output, run the crypto path in-browser, and hit the sync API. Spike fails → fall back to (a) without renegotiation. The fallback is pre-authorized here precisely so the spike cannot turn into a month.

**D7 - Server: Rust + Axum.** Product-doc direction. Alternatives noted for the record: Actix (heavier), reusing Chart35's Node/Express server (rejected under D2). Axum shares types with `verelle-core` via a common crate, which is the practical payoff of the all-Rust bet.

**D8 - Auth: email + password with Argon2id, opaque server sessions, couple linking by short-lived invite code.** Alternatives: OAuth social login (rejected: privacy posture and a third-party dependency for a privacy product), passkeys (deferred: additive later, not load-bearing now). Account recovery is recovery-code or partner-re-share only; support cannot restore data and the UI says so at signup (this is a feature of D5, stated as UX).

**D9 - Payments: Stripe on the web; the iOS purchase path is a gated decision.** Web: Stripe Checkout + Billing, settling to the Stephens Page LLC Mercury account (product-doc direction). Provisional pricing $4.99/mo or $39.99/yr, to be sanity-checked against Marquette NFP Pro and Read Your Body pricing at Phase 6. iOS: three lawful paths as of 2026 - (a) Apple IAP at 15% under the Small Business Program; (b) US external purchase links, now permitted but commissioned at 12%/27% with an attribution window after the 9th Circuit's 2025-12-11 modification of the Epic injunction (https://www.macrumors.com/2025/12/11/apple-app-store-fees-external-payment-links/, verified 2026-07-18); (c) no purchase surface in the app at all, subscribe on the web by your own initiative. At my scale (a) and (b) net out nearly identical and (a) is simpler UX. **Gated:** decide at Phase 6 as an ADR against the then-current guidelines (OQ-5). Android: Play Billing or web-subscribe, decided in the same ADR.

**D10 - Hosting and delivery: OpenTofu + Ansible onto a DigitalOcean droplet, GitHub Actions, Cloudflare DNS, Porkbun registrar.** Product-doc direction, and it is my existing fleet pattern. Recommendation within it: a dedicated 2 GB droplet (~$12/mo, inside NFR-8) from Phase 3 rather than colocating on the stephens.page droplet - not because the ciphertext is sensitive (D5 means it is not, much) but because a clean single-purpose host keeps the IaC honest and the blast radius of my 76-hostname shared droplet away from a health product. OQ-7 records the colocation question; observability reuses the existing fleet Prometheus/Grafana/Alertmanager stack either way.

**D11 - Sync protocol: cursor-based delta sync of encrypted records, last-write-wins per record, tombstones.** Each observation is one encrypted record keyed by (couple, date, marker type) with a client HLC timestamp inside the envelope and a server-assigned sequence number outside it; clients pull since-cursor, push queued writes, LWW resolves the rare two-writer conflict (a couple recording the same marker for the same day). Alternatives: CRDTs (overkill for records this granular and this rarely contended), event sourcing (more machinery than the domain needs). This is Chart35's cursor-delta design with conflict semantics made explicit.

**D12 - Name, trademark, brand.** The product name is Verelle (verelle.app) and never contains "Marquette." Marquette University's Boland Institute runs its own trademarked app, Marquette NFP™ Pro (https://www.marquettenfppro.com/, verified 2026-07-18), so references to the method in marketing are nominative only ("supports the Marquette Method protocols as taught by certified instructors") and get reviewed under OQ-3 before public listing. Brand direction per the product doc: feminine, blue-leaning, adjacent to the Clearblue monitor aesthetic (reference image in docs/verelle.md) but distinct from it - and visually distinct from Marquette NFP Pro, which is both the incumbent and the trademark holder's own product.

## 4. Architecture

### Components

| Component | Responsibility |
|---|---|
| `verelle-core` (Rust crate) | Domain types, Marquette protocol engine, cycle detection. No I/O. The only place protocol rules exist. |
| `verelle-store` (Rust crate) | SQLite persistence, migrations, observation queue for sync. |
| `verelle-crypto` (Rust crate) | Argon2id derivation, AES-256-GCM envelope (versioned), couple-key wrap/unwrap. |
| `verelle-sync` (Rust crate) | Client half of the cursor-delta protocol; offline queue drain. |
| `verelle-ffi` (Rust crate) | UniFFI interface over core+store+crypto+sync for Kotlin and Swift (UniFFI is production-proven in Firefox mobile, pre-1.0 - https://github.com/mozilla/uniffi-rs, verified 2026-07-18). |
| `verelle-server` (Rust/Axum) | Accounts, sessions, couple linking, entitlements, encrypted-record relay, Stripe webhooks. Shares types with core via a common crate. |
| `verelle-web` (Leptos, gated D6) | Web client; engine and crypto compiled to wasm in-module. |
| `apps/android`, `apps/ios` | Native shells: UI, notifications, platform keystore, store packaging. Watches post-1.0. |
| `corpus/` | Golden vectors: observation sequences → expected daily status, one file per scenario, instructor-reviewed, run in CI. |
| `infra/` | OpenTofu (droplet, DNS, firewall) + Ansible (hardening, Postgres, deploy) + GitHub Actions pipelines. |

### Data model (core entities)

- **Account** (email, auth hash, created_at) and **Device** (per-install sync cursor).
- **Couple** - exactly two accounts, a wrapped shared data key per member, link/unlink audit trail.
- **Observation** - the atom: (date, marker type, value enum: categorical monitor reading | quantitative reading | LH strip | bleeding | intercourse | mucus | temperature | note, recorded_by, HLC timestamp, tombstone flag). Append-mostly; grows ~365 rows/user/year - unbounded growth is not a concern at this scale.
- **Cycle** - derived by the engine from bleeding observations; materialized client-side only. The server never sees cycles because it never sees plaintext.
- **EncryptedRecord** (server) - (couple_id, record_id, seq, ciphertext, tombstone). **Subscription** - Stripe customer/sub IDs, entitlement state, grace-period expiry.

### Trust boundaries and threat model

Fertility data post-Dobbs is the motivating threat, so this section is material. The server-visible surface is: email addresses, auth hashes, Stripe billing linkage, couple graph, timestamps/sequence metadata, and ciphertext. What the server cannot produce, for anyone: readings, cycles, status, notes.

| Threat actor | Path | Control |
|---|---|---|
| Server breach / stolen backup | Droplet or Postgres compromise | D5: ciphertext only; backups encrypted; blast radius is metadata. Residual risk (accepted, documented): the couple graph and timing metadata are themselves revealing. |
| Legal compulsion | Subpoena to me or DigitalOcean | Server can produce metadata + ciphertext only; minimal logs (no request bodies); documented in the privacy policy. |
| Network attacker | MITM | TLS everywhere (Let's Encrypt); certificate pinning considered post-1.0. |
| Stolen/borrowed phone | Local DB read | OS file protection + platform keystore for keys; optional app PIN post-1.0. Residual risk on unlocked devices accepted and named in docs. |
| Estranged partner | Linked account reads ongoing data | FR-7: unlink is immediate; Phase 3 design doc covers re-key on unlink so future data is dark to the departed partner. Historical data both already hold is not retractable - stated honestly in the UI. |
| Malicious "partner" at link time | Social-engineered invite code | Codes are short-lived, single-use, and confirmed with the inviter's displayed identity before data flows. |
| Operator (me) | Insider access | D5 removes the ability, not just the policy, to read health data; admin actions (deletion, support) are audit-logged. |
| Third-party SDKs | The Premom failure mode | NFR-9: none, ever; push payloads are opaque pings. |

Audit events recorded server-side: auth successes/failures, couple link/unlink, deletion requests and completions, entitlement changes, admin access. Account recovery (the classic soft underbelly): recovery-code or partner-re-share only; no support-driven reset path exists to exploit (D8).

### External dependencies and failure domains

- **Server down / droplet lost**: clients are fully functional offline (NFR-1); sync resumes on recovery; rebuild is `tofu apply` + Ansible + restore from nightly backup (NFR-6). Fails open for users, by design.
- **Stripe down or webhook missed**: entitlements carry a 7-day grace period; reconciliation job re-polls Stripe daily. Fails open, bounded.
- **Clearblue supply failure** (A-3): data model already accepts quantitative monitors (D3); protocol addition is v1.1 scope, not a schema migration. OQ-6 watches this.
- **Apple/Google policy shifts on external payments**: D9 decides at Phase 6 against then-current rules, not today's.
- **Cloudflare/Porkbun/Let's Encrypt**: standard, low-touch; DNS is IaC'd; none hold health data.

Concurrency and time: HLC timestamps inside envelopes resolve two-writer LWW without trusting device clocks; all dates are civil dates in the user's recording timezone (fertility observations are day-granular; a timezone shift never re-buckets an existing observation). Idempotent push (record_id dedupe) makes retry safe.

## 5. Delivery phases

Estimates are in effort-weeks (1 ew ≈ 8 focused hours) with confidence marked; at my realistic 5-10 h/week, calendar time is 1-2× the effort number, and Phases 0-3 total roughly 14-22 ew ≈ 4-9 months of calendar. Greenfield system, no live migration anywhere; the only irreversible steps are called out in Phase 7.

**Phase 0 - Bootstrap.** Cargo workspace, crate skeletons, CI (fmt/clippy/test/corpus runner), ADR directory, corpus format decided. Deliverable: green pipeline on a hello-world engine test. Gate: CI runs the (empty) corpus on every push. 1-2 ew, high confidence. *Blocked on nothing - this phase is legitimate even while OQ-1 is open, because it is planning-adjacent scaffolding.*

**Phase 1 - Engine + corpus (retires the correctness risk).** Transcribe the published Marquette Model algorithm into a written spec; implement regular-cycles and (per OQ-2) postpartum protocol in `verelle-core`; author golden vectors including learning-phase, missed-reading, and protocol-boundary cases; property tests around cycle detection; `verelle-store` schema; a CLI harness that replays a vector file and prints the chart. Delivers: FR-2, FR-3, FR-4, FR-5, FR-6 (engine level), NFR-7. Acceptance gate: corpus 100% green in CI **and a certified Marquette instructor has reviewed the vectors and spec** (A-4). 4-6 ew, medium confidence. Depends on: Phase 0, OQ-1 resolved, OQ-2 answered.

**Phase 2 - Walking skeleton on the first phone (retires the architecture risk).** UniFFI bindings; native shell on the founding couple's primary platform (default Android per my Compose depth - OQ-2 can flip this): record screen, today's status, basic cycle chart, monitor-window reminder, local CSV/JSON export. Local-only, no accounts. Delivers: FR-2/3/4/5 (UI), FR-9 (basic), FR-10, FR-11 (export half), NFR-1 (local), NFR-5. Acceptance gate: a founding-couple member records a real day on a real phone; cold start < 2 s measured; UniFFI layer passes a round-trip test suite. 4-6 ew, medium confidence (Cascade precedent, UniFFI new to me).

**Phase 3 - Server, accounts, E2EE sync, couple sharing (MVP for the household).** Axum server; accounts and sessions; the D5 key design doc written and reviewed *before* implementation (gate-within-gate); couple invite/link/unlink with re-key; cursor-delta sync; entitlement model present but everything free-tier while unlaunched; OpenTofu + Ansible deploy to the droplet (OQ-7 decided here as an ADR); TLS; nightly encrypted backups off-droplet; **restore drill executed**; fleet Prometheus/Grafana targets added. Delivers: FR-1, FR-7, FR-8, FR-11 (deletion), NFR-2, NFR-3, NFR-4 (measured), NFR-6, NFR-8. Acceptance gate: two real phones, two accounts, one couple: observation recorded offline on one appears on the other ≤ 10 s after reconnect; unlink verified dark; restore drill passes; k6 run meets NFR-4. 6-9 ew, **low-medium confidence** - the couple key exchange is the novel engineering in this project. Depends on: Phase 2. *M1 measurement starts at this gate.*

**Phase 4 - Second phone platform.** SwiftUI shell (or Compose, if OQ-2 flipped Phase 2) to feature parity with Phase 2 + sync. Delivers: platform parity for FR-1..11. Gate: both founding-couple phones in daily use - couple sharing now delivers its value. 4-6 ew, medium confidence (Chart35 gave me working SwiftUI). Depends on: Phase 3. *If the household is single-platform, Phase 4 swaps order with Phase 5 freely.*

**Phase 5 - Web app.** The D6 Leptos spike (3 days, hard-boxed) → build: sign-in, chart view, record, export, account management. Delivers: web parity for FR-1..11; resolves OQ-8. Gate: spike verdict ADR'd; web client passes the same conformance expectations (same engine, so structurally true); crypto interop verified against a phone-written account. 1 ew spike + 4-6 ew build, low confidence (Leptos is new ground - that is partly the point). Depends on: Phase 3; parallelizable with Phase 4.

**Phase 6 - Payments.** Stripe Checkout/Billing + webhooks + entitlement enforcement + grace period; pricing checked against comparables; the OQ-5 mobile-purchase ADR against then-current App Store/Play rules; free-tier boundaries enforced (local use stays fully free). Delivers: FR-12. Gate: test-mode purchase → entitlement unlock → lapse → grace → lock, all exercised end-to-end; refund path documented. 3-4 ew, medium confidence. Depends on: Phase 3 (server), any client.

**Phase 7 - Public launch.** MHMDA-conformant consumer-health privacy policy; OQ-3 (trademark/nominative copy) and OQ-4 (regulatory posture) legal reviews closed; store listings (US storefronts), closed beta (10-20 couples from the Marquette community), crash-free and NFR re-verification, then public release on App Store, Play, and web (product-doc distribution). 3-5 ew, medium confidence. Depends on: Phases 4/5/6. **Reversible/irreversible:** everything before store submission is reversible. Submitting under the Verelle name/bundle IDs and taking the first external subscription are the points of no return (names and IDs are permanent; money creates obligations). Abort criteria before that point: OQ-3 or OQ-4 unresolved → do not submit; beta crash-free < 99.5% → do not submit. After it: recovery is standard ops (refunds via Stripe, incident response per §6), not rollback. Post-external-users, all schema changes are additive-only with a pre-deploy backup.

**Phase 8 - Watches (post-1.0).** Wear OS tile/complication + watchOS: today's status, quick-record. Delivers: FR-13. Gate: quick-record round-trips through sync from each watch. 5-8 ew, low confidence. Deliberately last: highest platform cost per user-value until the phone product proves M2.

## 6. Validation and operations

### Test levels and named scenarios

- **Conformance corpus** (the load-bearing suite): golden vectors per protocol scenario - regular cycles, learning phase, missed readings, back-to-back Peaks, cycle-start edge cases, postpartum window rules - instructor-reviewed, run on every commit (NFR-7).
- **Property tests**: cycle detection invariants (a bleeding-start always opens a cycle; status is a total function over any observation sequence; no panic on any input ordering).
- **Crypto interop tests**: envelope round-trip across Rust-native and wasm builds; wrong-key failure modes; version-envelope forward-compat.
- **Sync integration**: two simulated clients + real Postgres (testcontainers): offline queue drain, LWW conflict, tombstone propagation, cursor restart, idempotent re-push, unlink re-key darkness.
- **End-to-end**: the Phase 3 two-phone gate script, re-run per release; Stripe test-mode lifecycle (Phase 6 gate).
- **Load**: k6 sync-endpoint profile, 100 concurrent, NFR-4 threshold, run before Phase 7.
- **Restore**: the NFR-6 drill - runbook-driven restore to a fresh droplet, quarterly.

### Traceability matrix

| Req | Phase | Verification |
|---|---|---|
| FR-1 | 3 | Two-phone E2E gate script (account create/sign-in both platforms) |
| FR-2 | 1, 2 | Corpus vectors (values incl. quantitative variant); record-screen E2E |
| FR-3 | 1, 2 | Corpus vectors; record-screen E2E |
| FR-4 | 1 | Property tests + corpus cycle-boundary vectors |
| FR-5 | 1 | Corpus 100% green + instructor review sign-off |
| FR-6 | 1 | Postpartum corpus vectors + instructor review (protocol priority per OQ-2) |
| FR-7 | 3 | Sync integration (link, attribution, unlink-darkness) + two-phone gate |
| FR-8 | 3 | Offline-queue integration tests + two-phone gate |
| FR-9 | 2, 5 | Instructor reads a rendered chart in follow-up (M1 activity) |
| FR-10 | 2 | Manual device test in Phase 2 gate checklist |
| FR-11 | 2, 3 | Export golden-file test; deletion E2E (server rows gone, verified in Phase 3 gate) |
| FR-12 | 6 | Stripe test-mode lifecycle E2E |
| FR-13 | 8 | Watch quick-record round-trip test |
| NFR-1 | 2, 3 | Airplane-mode E2E in Phase 2/3 gates; queue-drain integration tests |
| NFR-2 | 3 | Crypto design review; server-side plaintext grep in code review; interop tests |
| NFR-3 | 3 | Timed two-phone propagation in Phase 3 gate |
| NFR-4 | 3, 7 | k6 run, threshold asserted |
| NFR-5 | 2 | Measured cold start in Phase 2 gate |
| NFR-6 | 3, quarterly | Restore drill runbook executed, logged |
| NFR-7 | 1 | Corpus in CI, blocking |
| NFR-8 | 3 | DO invoice ≤ $20/mo, checked monthly |
| NFR-9 | 2-7 | Dependency review in each release checklist; no analytics SDK in lockfiles |

### Observability

Reuse the existing fleet stack (Prometheus/Grafana/Alertmanager, already alerting via email + Twilio SMS): node exporter and postgres_exporter on the Verelle droplet, blackbox probe of `/healthz`, a backup-freshness metric (alert if the newest off-droplet backup is > 26 h old), Axum request metrics (rate/errors/duration). Logs: `tracing` JSON to journald, request metadata only - never bodies, never plaintext health data (structurally absent anyway), emails scrubbed to account IDs. Client crash reporting: store-native only (Play Console, App Store Connect) - no third-party SDK, per NFR-9. Paging: me, via the existing Alertmanager routes.

### Launch criteria (Phase 7 ship/no-ship, distinct from M1-M3)

1. Corpus 100% green and instructor sign-off recorded (NFR-7 / FR-5).
2. Restore drill passed within the last quarter (NFR-6).
3. MHMDA-conformant privacy policy published; in-app deletion verified (FR-11, C-4).
4. OQ-3 and OQ-4 closed with written outcomes.
5. Closed-beta crash-free sessions ≥ 99.5% over the final two beta weeks.
6. k6 NFR-4 run passed on the production droplet size.

### Post-launch review and operations

M1 is read at Phase 3 + 3 months (continue/iterate/stop on public investment); M2 at launch + 3 months and M3 at payments + 6 months (together they decide whether Verelle is a product or an apostolate that breaks even). I am the owner and the only operator: backups nightly (verified by the freshness alert), dependency updates via a monthly Renovate batch, store-compliance sweeps each Apple/Google policy season. The local-first design is also the succession plan: if the operator disappears, installed apps keep working and export keeps working; that promise goes in the public docs.

## 7. Risks and pre-mortem

Six months in, Verelle failed. The most plausible stories, with the plan's answer:

1. **Scope ate the solo developer.** Five client surfaces, a novel crypto design, and a payments stack, at 5-10 h/week, against a day job and a job search. *Answer:* MVP is Phase 3 on the household's own phones; watches are post-1.0 by plan; each phase has a hard gate so a stall leaves a working smaller product, not rubble. Early-warning signal: a phase exceeding 2× its effort estimate → cut surface (web or second platform waits), do not stretch.
2. **The career-plan collision.** Decision 4's "no new side projects ship for 12 months" was written 2026-06-10 for good reasons; Verelle either violates it or dies half-built as the 31st app. *Answer:* OQ-1 forces the choice explicitly before Phase 1 - ship-after-window, amend-the-plan, or fold-into-Chart35 - instead of drifting into the exact failure the rule exists to prevent. Phase 0 is the only build work permitted meanwhile.
3. **A wrong "infertile" day.** The engine mislabels a fertile day; a couple conceives against their intention; trust (and possibly more) is lost. *Answer:* the corpus + instructor review is the first phase, not an afterthought; ambiguous protocol readings resolve conservatively (toward "fertile"); D1 posture keeps the app paired with instruction; disclaimers state the app charts the protocol and does not replace the instructor. Residual risk is real and named: no charting app can make a method's failure rate zero.
4. **The incumbent owns the niche.** Marquette NFP Pro is official, trademarked, instructor-integrated; nobody needs a second app. *Answer:* Verelle's differentiators are zero-knowledge E2EE (D5), offline-first couple UX, and no-AI determinism - none of which require displacing the incumbent to win 25 couples (M2). Early-warning signal: closed beta can't fill 10 couples from the community → read M2 as failed early and stop before Phase 8 spend.
5. **The Rust-everywhere bet burns the calendar.** UniFFI friction, Leptos immaturity, wasm crypto edges - each individually survivable, together they consume the year. *Answer:* every novel-tech exposure sits behind a time-boxed spike or a walking-skeleton gate with a pre-authorized fallback (D6's TypeScript fallback; Phase 2's skeleton before any feature work). Early-warning signal: any spike that wants an extension gets its fallback instead.
6. **Privacy failure by a thousand cuts.** Not a breach - a convenience: an analytics SDK, a debug log with plaintext, a push payload with a status string. Premom's story. *Answer:* NFR-9 is absolute and checked per release; D5 makes the worst leak structurally small; the threat-model table is part of code review for every server change.

## 8. Open questions

| ID | Question | Owner | Resolution gate | Blocks |
|---|---|---|---|---|
| OQ-1 | Reconcile Verelle with career-plan Decision 4 (no new side projects for 12 months): ship after the window, amend the plan deliberately outside a working session, or fold Marquette support into the Chart35 estate (D2 alternative a)? | Jacob | A written decision, made against the career plan itself, before any Phase 1 commit | Phases 1+ (Phase 0 exempt) |
| OQ-2 | Founding couple's facts: which phones (orders Phases 2/4), which watch platforms (scopes Phase 8), and which protocol applies at their first real use (orders Phase 1 protocol work)? | Jacob | 15-minute household conversation, answers recorded in this doc | Phase 1 protocol priority; Phase 2 platform |
| OQ-3 | Nominative use of "Marquette Method" in listings and marketing, given Marquette NFP™ Pro and the university's marks - what copy is safe? | Jacob (+ 1 hr legal consult) | Reviewed copy checklist | Phase 7 store submission |
| OQ-4 | Regulatory posture: confirm D1's charting-tool positioning and disclaimer language against 21 CFR 884.5370 precedent with a healthcare-software attorney | Jacob (+ legal consult) | Written opinion or documented reasoned memo | Phase 7 store submission |
| OQ-5 | iOS/Android purchase path: IAP at 15%, US external links at 12%+, or web-only subscribe - against the rules in force at Phase 6 | Jacob | ADR at Phase 6 open | Phase 6 mobile purchase UX |
| OQ-6 | Mira and Clearblue-supply watch: when does quantitative-protocol support (v1.1 candidate) become necessary rather than optional? | Jacob | Ask the instructor at the Phase 1 review; recheck availability each quarter | v1.1 scope only (schema already ready per D3) |
| OQ-7 | Dedicated droplet vs colocation on the stephens.page host for Phases 0-3 (D10 recommends dedicated from Phase 3) | Jacob | Infra ADR at Phase 3 start | Phase 3 deploy target |
| OQ-8 | Leptos or the TypeScript fallback for web | Jacob | The D6 spike verdict, 3 days, ADR'd | Phase 5 build |

What I do not yet know, and say so: whether the Marquette community wants a second app at all (M2 is the test, not my intuition), whether the couple-key crypto design survives review without a redesign (Phase 3's gate exists for exactly that), and whether this project should exist this year at all (OQ-1 - the hardest question in the document, and the plan deliberately does not pretend to have answered it).

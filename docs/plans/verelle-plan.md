# Plan: Verelle (revision 3)

*Author: Jacob Stephens. Revision 3, 2026-07-18. Changes from revision 2: gate G2 closed by re-scope - v1.0 ships as a record-and-display charting tool with no computed fertility status (Jacob's decision, this date); gate G3 re-scoped - the acquired source package at docs/marquette-method-business-logic-specification-for-verelle.md unblocks v1 entirely and seeds the deferred v2 computed-status gate package (OQ-11). Gate G1 closed earlier this date (C-2). Revision 2 is preserved at docs/plans/reviews/verelle-plan-rev2-2026-07-18.md; revision 1 and its adversarial review and adjudication are in docs/plans/reviews/. External claims verified 2026-07-18 unless noted. **Readiness: READY for the v1.0 scope defined here.** The v2 computed-status feature remains gated behind OQ-11.*

## 1. Summary

Verelle is a cross-platform charting app for couples using the Marquette Method of natural family planning: one Rust core behind native shells (Kotlin/Jetpack Compose on Android, Swift/SwiftUI on iOS, Leptos on web, watches after 1.0), a Rust + Axum sync server over PostgreSQL, and end-to-end encryption so the server only ever stores ciphertext. The smallest version that delivers real value is the founding couple charting daily on their own two phones with shared visibility and zero data loss; the next users are the friends this app exists to help.

v1.0 is deliberately a **record-and-display** product: it records monitor readings, LH strips, mucus, bleeding, temperature, and notes, and renders them as an instructor-readable Marquette-style chart with mechanical annotations only. It never tells the user what her data means - no computed fertile/infertile status, no fertile-window bounds, no conception-timing suggestions. That single boundary is what keeps Verelle on the safe side of the FDA's device-software line (the 21st Century Cures Act excludes record-keeping and display software from the device definition, but the exclusion stops where software interprets or analyzes for a medical purpose; the Class II precedent for computed contraceptive guidance is 21 CFR 884.5370 / product code PYT, created by Natural Cycles' De Novo DEN170052). The couple applies their instruction to the chart, exactly as the method is taught. Computed status is a v2 feature behind its own gate package (OQ-11), for which docs/marquette-method-business-logic-specification-for-verelle.md is the acquired foundation.

The plan's build order retires risk first: the lifecycle specifications (sync state machine, key/membership lifecycle, deletion/retention model) before any schema freezes, then the chart core, then a one-phone walking skeleton, then the E2EE sync server that makes it a couple's app.

## 2. Outcome and requirements

### Intended outcome

A couple can chart the Marquette Method day to day - record the monitor reading and supplemental markers, and both see the same instructor-readable chart - on whatever device is in reach, offline, without surrendering plaintext health data to any server, including mine. Target users: instructed Marquette Method couples, starting with my own household, then the friends this app exists to help, then the broader Marquette community (instructor-referred couples, the method's active online groups). Interpretation stays with the couple and their instructor; Verelle is the chart, not the verdict.

### Success metrics (post-launch value, distinct from the launch criteria in §6)

| ID | Metric | Baseline | Target | Measurement window |
|---|---|---|---|---|
| M1 | Founding couple charts daily in Verelle as their chart of record: zero lost acknowledged observations, and their instructor accepts the rendered chart at a real follow-up | none measured | ≥ 60 consecutive days, 0 losses, instructor accepts the chart | within 3 months of the Phase 3 acceptance gate |
| M2 | External weekly-active accounts | 0 | ≥ 25 | within 3 months of public launch (Phase 7) |
| M3 | Active paid subscriptions | 0 | ≥ 20 | within 6 months of payments launch (Phase 6) |

M1 is the kill-or-continue gate for public investment: if the app cannot replace the paper chart for my own household, nobody else will switch either.

### Functional requirements

- **FR-1** Create an account (email + password) and sign in on any supported platform. Local-only use without an account works on every platform (account-optional, the Chart35 posture).
- **FR-2** Record a daily Clearblue Fertility Monitor reading (Low / High / Peak / missed / error) against a date, plus monitor-setup facts (m-button date and time, from which the app derives and displays the manufacturer-documented six-hour testing window). The observation model also accepts quantitative hormone readings (numeric E3G / LH values) so Mira-class monitors can be added without a schema migration (see D3 and OQ-6). Marker vocabulary and entity shapes follow docs/marquette-method-business-logic-specification-for-verelle.md §8.
- **FR-3** Record supplemental markers per date: LH test strip result (qualitative line comparison or T/C ratio), bleeding/menstruation, intercourse, optional mucus observation (sensation/appearance/category), optional temperature, free-text note.
- **FR-4** Cycle bookkeeping: the user marks cycle day 1 (first day of true menses, or an artificial-cycle start for postpartum monitor use); the app numbers cycle days, tracks method-cycle count, and shows current and historical cycles. Bookkeeping is arithmetic on user-marked events, never inference.
- **FR-5** Chart display with mechanical annotations only: the classic Marquette-style grid of monitor readings and markers per cycle day, with cycle-day numbers and event-anchored counts (for example, P+1/P+2/P+3 tags counting forward from a **user-marked** Peak day). The app never computes or displays fertility status, fertile-window bounds, or day classifications. The annotation set ships only after the Phase 7 legal copy/feature review confirms each annotation stays on the display side of the interpret/analyze line.
- **FR-6** The chart and data model accommodate both regular-cycle and postpartum usage patterns (artificial-cycle stretches, non-cycling periods, return-to-cycles numbering per the research spec's vocabulary) as recorded structures. Protocol logic for any of them is v2 (OQ-11).
- **FR-7** Couple sharing: link exactly two accounts by invite code; both partners read and write the shared chart with per-entry attribution; unlink takes effect immediately per the Phase S key lifecycle - the key epoch is advanced, the server rejects old-epoch pushes from that point, and the departing partner has no access to post-unlink data.
- **FR-8** Multi-device sync for one account and across the linked couple, offline-first: every client is fully functional with no network and reconciles when connectivity returns per the Phase S sync state machine.
- **FR-9** The rendered chart is instructor-readable: a follow-up can be conducted from the Verelle chart as readily as from the paper chart (M1 tests exactly this).
- **FR-10** Local reminder notifications, user-configured: the user sets reminder times (typically from her m-button testing window, which the app displays per FR-2). The app does not compute protocol-driven testing schedules.
- **FR-11** Data export (CSV and JSON) from any client, plus four distinct deletion operations, each defined in the Phase S deletion model: (a) delete a single observation, (b) unlink from a couple, (c) delete one account, (d) destroy a whole couple dataset. Server-side deletion is effective across live systems and, via the deletion manifest, across backups within the statutory bound (WA MHMDA permits delaying backup deletion at most six months from an authenticated request, RCW 19.373; our 30-day backup expiry keeps the practical bound near 30 days). Apple requires in-app account deletion (App Store Review Guideline 5.1.1(v)).
- **FR-12** Freemium billing: local single-user use is free forever; sync, couple sharing, and encrypted backup require a subscription paid via Stripe (settling to the Stephens Page LLC Mercury account). Entitlement is enforced server-side. Lapse behavior is defined: 7-day grace, then sync pauses (nothing is deleted); lapsed-account ciphertext is retained 12 months with two warning emails, then deleted per the retention table in §4.
- **FR-13** Watch apps (Wear OS, watchOS): the chart's most recent entries at a glance and quick-record of the monitor reading. Post-1.0; the Phase S key lifecycle must already name the watch-enrollment path so Phase 8 does not force an epoch redesign.

### Nonfunctional requirements

- **NFR-1** Recording an observation succeeds with zero network connectivity, 100% of the time, and no acknowledged local write is ever lost - including across concurrent edits, edit/delete races, retries with response loss, process death between local commit and enqueue, cursor restarts, and backup restores. Verified by the Phase 3 convergence suite, not by a single happy-path test.
- **NFR-2** Zero-knowledge server: all health observations are encrypted on-device (AES-256-GCM envelope, versioned format) before upload; encryption keys never leave clients; the server can produce only ciphertext plus account metadata under any compulsion.
- **NFR-3** Freshness, split by client state. Foreground-to-foreground: an observation committed on one partner's device renders on the other partner's foregrounded device in ≤ 10 s at p95, measured end to end. Background/suspended clients: best-effort push invalidation plus sync-on-resume, with no hard latency promise (Apple documents background pushes as low-priority and not guaranteed; Android Doze defers background network). Every chart surface shows a last-synced freshness indicator.
- **NFR-4** Sync API p95 latency < 300 ms at 100 concurrent users on a 2 GB DigitalOcean droplet (k6, measured before public launch).
- **NFR-5** Cold start to the record screen < 2 s on a mid-range Android phone.
- **NFR-6** Durability: nightly encrypted PostgreSQL backups shipped off-droplet with 30-day expiry; a restore drill - including reapplication of the deletion manifest - demonstrated before household daily use begins and re-run quarterly.
- **NFR-7** Chart correctness: 100% pass on a golden-render suite - recorded-observation fixtures paired with expected chart structures (day numbering, annotation counts, artificial-cycle handling), run in CI on every commit - plus an instructor's review of the chart format against real charts before M1 begins. The heavyweight protocol-conformance machinery (rule ledger, instructor-derived vectors, hazard analysis) belongs to the v2 gate package (OQ-11), because v1 has no protocol rules to verify.
- **NFR-8** Infrastructure cost ≤ $20/month pre-revenue (excludes the $99/yr Apple Developer fee, one-time $25 Play fee, and the one-off professional-services budget in C-5).
- **NFR-9** No third-party analytics, advertising, or tracking SDK in any client, ever (the FTC's Premom enforcement is the named cautionary case - https://www.ftc.gov/news-events/news/press-releases/2023/05/ovulation-tracking-app-premom-will-be-barred-sharing-health-data-advertising-under-proposed-ftc, verified 2026-07-18). Push notifications carry opaque "sync now" payloads only, never health data; push tokens are treated as consumer health data in the §4 inventory because possession of a Verelle account is itself health-revealing.
- **NFR-10** Deletion completeness: an authenticated deletion request is effective across live stores within 30 days and across backups within the backup-expiry window (30 days, ceiling 6 months per RCW 19.373), proven by the restore-with-manifest drill, and propagated to processors per the §4 inventory.

### Non-goals (v1.0)

- **Computed fertility status of any kind** - no fertile/infertile classification, no fertile-window bounds, no "requires instructor protocol" day statuses, no conception-timing prioritization. This is the load-bearing non-goal: it is what keeps v1 outside the FDA device-software line, and it is a deliberate product boundary, not a missing feature. v2 revisits it only through the OQ-11 gate package.
- Protocol eligibility checking (age/cycle-range screens) and effectiveness statistics anywhere in the product or its marketing.
- Perimenopause-specific features, and Mira quantitative protocol support (data model accepts the readings; anything more is v2+, OQ-6).
- Sympto-thermal or Creighton method support - Chart35 already serves Creighton; Verelle stays Marquette-only.
- HealthKit / Health Connect integration.
- Instructor portal, in-app messaging, or any marketplace.
- AI/ML prediction of any kind.
- Freshness guarantees for backgrounded or suspended clients (see NFR-3).
- Desktop apps, localization beyond English, and non-US storefronts at launch (expansion revisited post-1.0; GDPR work deferred with it).
- Pregnancy-mode tracking (a likely v1.x feature; deferred).

### Constraints and assumptions

Constraints:

- **C-1** Solo developer, nights-and-weekends hours, competing directly with my day job and the active job-search workstream in career-advancement-plan.md. Sustained capacity is realistically 5-10 focused hours/week, and some weeks it is zero.
- **C-2** My 2026 career plan (Decision 4, 2026-06-10) rules: "no new side project ships for 12 months." **Resolved 2026-07-18 (gate G1 closed):** Verelle proceeds now as a deliberate, scoped exception - it exists to help friends, and I accept the cost to the rule with eyes open rather than waiting out the window or folding into Chart35. The residual risk (Verelle hours displacing the job search) stays live in §7 story 2. The career plan itself should get a one-line annotation recording this exception; that edit is mine to make, outside this working session.
- **C-3** Stack directions fixed by docs/verelle.md: Rust core, Rust + Axum server, PostgreSQL, UniFFI bindings, Kotlin/Compose and Swift/SwiftUI shells, Leptos-or-TypeScript web, domain verelle.app, Stripe → Mercury, GitOps on GitHub Actions + OpenTofu + Ansible + DigitalOcean + Cloudflare DNS + Porkbun.
- **C-4** Regulated-adjacent domain: FDA product code PYT / 21 CFR 884.5370 (software application for contraception, Class II, created by the Natural Cycles De Novo DEN170052) is the classification computed fertility guidance is evaluated against - v1 avoids the line by not interpreting (see D1); the FTC Health Breach Notification Rule applies to fertility apps (Premom); Washington's My Health My Data Act (ch. 19.373 RCW, in force 2024-03-31) applies to any WA consumer's data, extends deletion to archived and backup systems with processor flow-down, and is enforced by the WA Attorney General and through consumer suits under the state Consumer Protection Act (RCW 19.86); Apple 5.1.1(v) requires in-app account deletion.
- **C-5** One-off professional-services budget of up to ~$3,000: privacy-counsel parameters for the deletion model (OQ-10), the pre-launch legal copy/feature review (OQ-3), and an applied-cryptography design review (OQ-9). The FDA-device-counsel engagement moves to the v2 gate package (OQ-11) and its cost moves with it.
- **A-1** The founding couple are the first two users. **Resolved 2026-07-20:**
  both use Android phones, so Android is the Phase 2 walking-skeleton target;
  iOS follows as the second phone platform. See OQ-2 and ADR 0004.
- **A-2** Mac access is sufficient for iOS/watchOS builds and submission (the Chart35 arrangement).
- **A-3** The Clearblue Fertility Monitor remains purchasable (in stock at major retailers, verified 2026-07-18; Walgreens has delisted it - watch item, feeds OQ-6).
- **A-4** A certified Marquette instructor is available for a chart-format review before M1 (an hour of their time, not protocol derivation; instructor budget ≤ $200, inside C-5). The heavier instructor engagement (independent vector derivation) belongs to OQ-11.

## 3. Design decisions

**D1 - Product posture: record-and-display, on the safe side of the interpret/analyze line.** The FDA device definition excludes software for storing, transferring, and displaying medical data unless it is "intended to interpret or analyze" it (21st Century Cures Act software exclusions, 21 U.S.C. 360j(o)); computed contraceptive guidance sits on the regulated side as Class II (21 CFR 884.5370 / PYT, the Natural Cycles De Novo DEN170052, https://www.accessdata.fda.gov/cdrh_docs/pdf17/DEN170052.pdf, verified 2026-07-18). Revisions 1-2 held computed status as the core feature behind a counsel gate; on 2026-07-18 I chose the other branch deliberately: **v1 removes interpretation entirely** rather than paying the counsel-latency and residual-risk cost of shipping it. Consequences, all binding: (a) the app renders what the user recorded, with mechanical annotations anchored to user-marked events only; (b) marketing copy describes charting ("chart your Marquette Method observations"), never outcomes - no avoid/achieve claims, no effectiveness statistics; (c) the **feature discipline rule**: no feature that tells the user what her data means ships outside the OQ-11 gate package - this rule is what the §7 pre-mortem defends; (d) a light legal review at Phase 7 (folded into the OQ-3 consult) confirms the copy and the annotation set, a checklist item rather than a viability gate. Alternatives considered: counsel-gated computed status (rev 2's design - retained as the v2 path); FDA clearance outright (rejected: the Natural Cycles evidence base is beyond solo-project economics).

**D2 - Greenfield Rust core rather than extending the Chart35 estate.** Alternatives: (a) build Marquette support into Chart35's existing TypeScript/Swift/Kotlin three-implementation stack and Node sync server; (b) greenfield one-Rust-core architecture per docs/verelle.md. Chosen: (b), per explicit product-doc direction, with the conflict recorded rather than hidden: (a) is the boring default and would reuse a proven zero-knowledge sync layer, an existing store presence, and real users. What decides (b): docs/verelle.md names the Rust stack as an explicit goal, Cascade already proved one-Rust-core-many-shells for me, and consolidating three engine implementations into one is the architectural lesson Chart35 taught. The Chart35 designs (golden-fixture testing, zero-knowledge sync, provider-share filtering) carry over as designs, not code. OQ-1 resolved 2026-07-18: proceed as Verelle now (scoped exception to the career plan, C-2); the fold-into-Chart35 alternative was considered and not taken.

**D3 - One Rust core; the protocol-engine seam reserved but empty in v1.** `verelle-core` holds domain types, cycle bookkeeping, and chart-layout logic, compiled natively for Android/iOS via UniFFI and to wasm for web. The marker vocabulary, entity shapes, and device-operation facts (m-button, testing window, reading meanings) come from docs/marquette-method-business-logic-specification-for-verelle.md - used in v1 as a *vocabulary and data-model reference*, not as executable rules. The observation value type is a tagged enum carrying categorical (Low/High/Peak) or quantitative (numeric E3G/LH) readings from day one, so Mira-class input is additive (FR-2, OQ-6). The crate boundary deliberately reserves a protocol-engine seam so the v2 computed-status feature (OQ-11) plugs in without redesign; nothing ships in that seam in v1.

**D4 - Storage: SQLite in the core on every client; PostgreSQL on the server.** Client store: rusqlite inside `verelle-store`, one schema for all platforms, derived from the Phase S specifications (op log and outbox shapes are lifecycle-spec outputs, not ad hoc). Server: PostgreSQL (product-doc direction) holding accounts, entitlements, and the encrypted operation log. Alternative considered: SQLite server-side (Chart35 does this) - rejected in favor of the doc's direction; Postgres also gives me streaming backups and the fleet's existing postgres_exporter.

**D5 - End-to-end encryption, zero-knowledge server, with the key lifecycle specified before any schema freezes.** Alternatives: (a) plaintext-on-server, enabling server-side computation; (b) client-side encryption, server stores ciphertext only. Chosen: (b), the Chart35 premise carried forward. Rationale: fertility data is the exact class of data that made Premom an FTC action and motivated WA MHMDA; a server that cannot read the data is the strongest control against breach, subpoena, and my own future temptation to add analytics. Consequence accepted: "server-side features" in the freemium tier are constrained to blind services - encrypted sync relay, encrypted backup, couple key exchange, entitlements. The full key and membership lifecycle - device identity keys, account data key, Argon2id split derivation with a true auth/data separation (the server must never receive a password-equivalent reusable secret), per-device and per-member wrapping, key epochs, local-to-account import atomicity, password change, recovery-code custody, partner re-share, device loss/revocation, unlink semantics including queued old-epoch writes, and the future watch-enrollment path - is specified in Phase S, before the Phase 1 schema, and reviewed externally per OQ-9. A partner holding the couple key remains a recovery path - couple sharing doubles as backup.

**D6 - Web: Leptos, behind a time-boxed spike.** Alternatives: (a) TypeScript + wasm-bindgen around the Rust core (larger ecosystem, my deepest platform); (b) Leptos (https://leptos.dev, active and stable in the 0.7+ line, verified 2026-07-18), where the core links into the same wasm module with no JS binding layer. Chosen: (b), per the product doc's stated intent to try Leptos, **gated** by a 3-day spike (Phase 5): render a chart from core output, run the crypto path in-browser, and hit the sync API. Spike fails → fall back to (a) without renegotiation. The fallback is pre-authorized here precisely so the spike cannot turn into a month.

**D7 - Server: Rust + Axum.** Product-doc direction. Alternatives noted for the record: Actix (heavier), reusing Chart35's Node/Express server (rejected under D2). Axum shares types with `verelle-core` via a common crate, which is the practical payoff of the all-Rust bet.

**D8 - Auth: email + password with Argon2id, opaque server sessions, couple linking by short-lived invite code.** Alternatives: OAuth social login (rejected: privacy posture and a third-party dependency for a privacy product), passkeys (deferred: additive later, not load-bearing now). The exact auth-secret derivation and its separation from the data key are Phase S outputs (D5). Account recovery is recovery-code or partner-re-share only; support cannot restore data and the UI says so at signup.

**D9 - Payments: Stripe on the web; the iOS purchase path is a gated decision.** Web: Stripe Checkout + Billing, settling to the Stephens Page LLC Mercury account (product-doc direction). Provisional pricing $4.99/mo or $39.99/yr, to be sanity-checked against Marquette NFP Pro and Read Your Body pricing at Phase 6. iOS: three lawful paths as of 2026 - (a) Apple IAP at 15% under the Small Business Program; (b) US external purchase links, now permitted but commissioned at 12%/27% with an attribution window after the 9th Circuit's 2025-12-11 modification of the Epic injunction (https://www.macrumors.com/2025/12/11/apple-app-store-fees-external-payment-links/, verified 2026-07-18); (c) no purchase surface in the app at all, subscribe on the web by your own initiative. At my scale (a) and (b) net out nearly identical and (a) is simpler UX. **Gated:** decide at Phase 6 as an ADR against the then-current guidelines (OQ-5). Android: Play Billing or web-subscribe, decided in the same ADR. Lapse and retention behavior per FR-12.

**D10 - Hosting and delivery: OpenTofu + Ansible onto a DigitalOcean droplet, GitHub Actions, Cloudflare DNS, Porkbun registrar.** Product-doc direction, and it is my existing fleet pattern. Recommendation within it: a dedicated 2 GB droplet (~$12/mo, inside NFR-8) from Phase 3 rather than colocating on the stephens.page droplet - not because the ciphertext is sensitive (D5 means it is not, much) but because a clean single-purpose host keeps the IaC honest and the blast radius of my 76-hostname shared droplet away from a health product. OQ-7 records the colocation question; observability reuses the existing fleet Prometheus/Grafana/Alertmanager stack either way.

**D11 - Sync: append-only encrypted operation log; the server never resolves conflicts.** Every write is an immutable operation with a client-generated unique op_id (idempotency key); the logical record key (couple, date, marker type) travels inside the ciphertext; the server appends ops, assigns a monotonic sequence, and serves them through a transactional cursor - it stores and forwards, nothing more. Clients converge by applying a deterministic merge after decryption: highest HLC wins, device-ID tiebreak for identical HLCs; deletes are tombstone ops merged by the same rule; a new device bootstraps by full replay (at ~365 ops/user/year, replay is trivially cheap; no server compaction in v1). Accepted and documented privacy cost: the server sees op count, size, timing, key epoch, and deletion scopes - not content. The full state machine (queue drain, retry with response loss, process death between commit and enqueue, cursor restart, restore/replay, epoch changes mid-queue) is a Phase S specification with a model-based convergence suite as its acceptance test. Alternatives: CRDT libraries (more machinery than day-granular observations need), server-side LWW (impossible under E2EE, which is the point).

**D12 - Name, trademark, brand.** The product name is Verelle (verelle.app) and never contains "Marquette." Marquette University's Boland Institute runs its own trademarked app, Marquette NFP™ Pro (https://www.marquettenfppro.com/, verified 2026-07-18), so references to the method in marketing are nominative only ("chart your observations for the Marquette Method as taught by certified instructors") and get reviewed under OQ-3 before public listing, alongside outreach to the Institute. Brand direction per the product doc: feminine, blue-leaning, adjacent to the Clearblue monitor aesthetic (reference image in docs/verelle.md) but distinct from it - and visually distinct from Marquette NFP Pro, which is both the incumbent and the trademark holder's own product.

**D13 - Push delivery and freshness.** APNs and FCM are named dependencies, not an afterthought: the server holds a push-token registry with token rotation and removal, sends opaque collapse-keyed "sync" pings, and records provider-response metrics. Foreground clients use an active path (short poll on foreground plus push-triggered fetch; a WebSocket upgrade is a Phase S option, not a commitment). Background clients get best-effort invalidation and sync-on-resume. Every chart surface renders a last-synced indicator so staleness is visible instead of silently misleading (NFR-3).

## 4. Architecture

### Components

| Component | Responsibility |
|---|---|
| `verelle-core` (Rust crate) | Domain types, cycle bookkeeping, chart-layout logic. No I/O. Vocabulary per the research spec; the protocol-engine seam reserved and empty in v1 (D3). |
| `verelle-store` (Rust crate) | SQLite persistence, migrations (tested up and down), atomic observation+outbox commit, op queue. Schema derived from the Phase S specs. |
| `verelle-crypto` (Rust crate) | Argon2id derivation with auth/data separation, AES-256-GCM envelope (versioned), key epochs, couple-key wrap/unwrap. Implements the Phase S key lifecycle. |
| `verelle-sync` (Rust crate) | Client half of the op-log protocol; deterministic merge; queue drain; bootstrap replay. Implements the Phase S sync state machine. |
| `verelle-ffi` (Rust crate) | UniFFI interface over core+store+crypto+sync for Kotlin and Swift (UniFFI is production-proven in Firefox mobile, pre-1.0 - https://github.com/mozilla/uniffi-rs, verified 2026-07-18). |
| `verelle-server` (Rust/Axum) | Accounts, sessions, couple linking, entitlements, append-only encrypted op log, deletion manifest, push relay (APNs/FCM token registry, opaque pings), Stripe webhooks. Shares types with core via a common crate. |
| `verelle-web` (Leptos, gated D6) | Web client; core and crypto compiled to wasm in-module. |
| `apps/android`, `apps/ios` | Native shells: UI, notifications, platform keystore, store packaging. Watches post-1.0. |
| `fixtures/` | Golden-render suite: recorded-observation fixtures paired with expected chart structures, run in CI (NFR-7). |
| `docs/marquette-method-business-logic-specification-for-verelle.md` | Marquette business-logic vocabulary reference for v1 and foundation of the v2 gate package (OQ-11). |
| `docs/specs/` | The Phase S lifecycle specifications (sync state machine, key/membership lifecycle, deletion/retention model) and their shared invariant matrix, versioned; schema PRs must cite them. |
| `infra/` | OpenTofu (droplet, DNS, firewall) + Ansible (hardening, Postgres, deploy) + GitHub Actions pipelines. |

### Data model (core entities)

- **Account** (email, auth verifier per the Phase S derivation, created_at) and **Device** (per-install identity, sync cursor, push token).
- **Couple** - exactly two accounts, wrapped shared data key per member per epoch, link/unlink audit trail with epoch history.
- **Observation** (client-side) - the atom: (date, marker type, value enum: categorical monitor reading | quantitative reading | LH strip result | bleeding | intercourse | mucus | temperature | note | monitor-setup event | user-marked Peak, recorded_by, HLC timestamp). Materialized client-side by merging the op log; grows ~365 ops/user/year - unbounded growth is not a concern at this scale. Entity detail follows the research spec §8 (MonitorSetup facts, LH strip qualitative/T-C fields, mucus sensation/appearance/category).
- **Cycle** (client-side) - user-marked start (menses or artificial-cycle trigger), derived day numbering and method-cycle count; bookkeeping only.
- **EncryptedOp** (server) - (couple_id, op_id, seq, key_epoch, ciphertext, received_at). Append-only; idempotent on op_id.
- **DeletionManifest** (server) - (scope: op set / account / couple, authenticated_at, live-applied_at, backup horizon date). Reapplied after every restore; contains identifiers only, no health data.
- **Subscription** - Stripe customer/sub IDs, entitlement state, grace-period expiry, lapse timestamps for the retention schedule.

### Retention table

| Data | Retention |
|---|---|
| Encrypted ops | Life of the couple dataset; removed per deletion model (FR-11) |
| Backups | 30-day expiry; deletion manifest reapplied on any restore (NFR-10) |
| Lapsed-subscription ciphertext | 12 months after grace ends, two warning emails, then deleted |
| Audit events | 24 months |
| Server logs (metadata only) | 30 days |
| Deletion manifests | Retained indefinitely (identifiers only; they are the proof of deletion) |
| Push tokens | Deleted on sign-out, device removal, or provider-reported invalidity |

### Trust boundaries and threat model

Fertility data post-Dobbs is the motivating threat, so this section is material. The server-visible surface is: email addresses, auth verifiers, Stripe billing linkage, couple graph, push tokens, op timing/size/epoch metadata, deletion scopes, and ciphertext. What the server cannot produce, for anyone: readings, cycles, charts, notes. Account existence and all of the metadata above are themselves treated as consumer health data in the §6 inventory and privacy policy, because a Verelle account is health-revealing on its own.

| Threat actor | Path | Control |
|---|---|---|
| Server breach / stolen backup | Droplet or Postgres compromise | D5: ciphertext only; backups encrypted; blast radius is metadata. Residual risk (accepted, documented): the couple graph and timing metadata are themselves revealing. Response: the §6 incident-response runbook, not improvisation. |
| Legal compulsion | Subpoena to me or DigitalOcean | Server can produce metadata + ciphertext only; minimal logs (no request bodies); documented in the privacy policy. |
| Network attacker | MITM | TLS everywhere (Let's Encrypt); certificate pinning considered post-1.0. |
| Stolen/borrowed phone | Local DB read | OS file protection + platform keystore for keys; optional app PIN post-1.0. Residual risk on unlocked devices accepted and named in docs. |
| Estranged partner | Linked account reads ongoing data | FR-7: unlink advances the key epoch immediately; the server rejects old-epoch pushes from that point, and remaining-device queued writes are re-encrypted to the new epoch before acceptance (availability cost accepted). Verified by adversarial tests including an offline remaining device and a restored backup. Historical data both already hold is not retractable - stated honestly in the UI. |
| Malicious "partner" at link time | Social-engineered invite code | Codes are short-lived, single-use, and confirmed with the inviter's displayed identity before data flows. |
| Operator (me) | Insider access | D5 removes the ability, not just the policy, to read health data; admin actions (deletion, support) are audit-logged. |
| Push providers (Apple/Google) | Traffic analysis | Opaque collapse-keyed pings only; providers see timing, never content (NFR-9). |
| Third-party SDKs | The Premom failure mode | NFR-9: none, ever. |

Audit events recorded server-side: auth successes/failures, couple link/unlink with epoch changes, deletion requests and completions (manifest entries), entitlement changes, admin access. Account recovery (the classic soft underbelly): recovery-code or partner-re-share only; no support-driven reset path exists to exploit (D8).

### External dependencies and failure domains

- **Server down / droplet lost**: clients are fully functional offline (NFR-1); sync resumes on recovery; rebuild is `tofu apply` + Ansible + restore from nightly backup + deletion-manifest reapplication (NFR-6, NFR-10). Fails open for users, by design.
- **APNs/FCM outage or throttling**: freshness degrades to poll-on-foreground and sync-on-resume; the freshness indicator makes the staleness visible; no data loss (D13).
- **Stripe down or webhook missed**: entitlements carry a 7-day grace period; reconciliation job re-polls Stripe daily. Fails open, bounded.
- **Clearblue supply failure** (A-3): data model already accepts quantitative monitors (D3); anything protocol-shaped is v2 scope. OQ-6 watches this.
- **Apple/Google policy shifts on external payments**: D9 decides at Phase 6 against then-current rules, not today's.
- **Cloudflare/Porkbun/Let's Encrypt**: standard, low-touch; DNS is IaC'd; none hold health data.

Concurrency and time: convergence is a client-side deterministic function of the decrypted op set (D11) - HLC then device-ID, tombstones merged by the same rule - so any two clients holding the same ops render the same chart, regardless of arrival order. Idempotent push (op_id) makes retry safe; the convergence suite (§6) is the proof, covering concurrent edit/edit, edit/delete, response-loss retries, clock skew, process death, cursor restart, restore/replay, and three-device histories. All observation dates are civil dates in the user's recording timezone (observations are day-granular; a timezone shift never re-buckets an existing observation).

## 5. Delivery phases

Estimates are in effort-weeks (1 ew ≈ 8 focused hours) with confidence marked; at my realistic 5-10 h/week, calendar time is 1-2× the effort number. Phases 0+S+1+2+3 total roughly 17-27 ew ≈ 6-12 months of calendar. No gate blocks the build path: G1 closed 2026-07-18 (C-2), G2 closed by re-scope 2026-07-18 (D1), G3 re-scoped to the v2 package (§8). Greenfield system, no live migration anywhere; the irreversible steps are called out in Phase 7. Revision 2's Phase R (regulatory viability) is dissolved: its privacy-counsel item moved into Phase S, its copy review into Phase 7, and its FDA-counsel engagement into the v2 gate package (OQ-11).

**Phase 0 - Bootstrap.** Cargo workspace, crate skeletons, CI (fmt/clippy/test/golden-render runner), ADR directory, `docs/specs/` skeleton, fixture format decided. Deliverable: green pipeline on a hello-world core test. Gate: CI runs the (empty) fixture suite on every push. 1-2 ew, high confidence.

**Phase S - Lifecycle specifications.** Three cross-referenced specs plus one shared invariant matrix in `docs/specs/`, written before any schema freezes: (a) **sync state machine** - op log, cursor transactionality, queue drain, retry/response-loss, process-death points, bootstrap replay, epoch changes mid-queue (D11); (b) **key and membership lifecycle** - everything listed in D5, including local-to-account import atomicity, unlink epoch semantics with queued old-epoch writes, recovery, device revocation, and the watch-enrollment path (FR-13); (c) **data inventory and deletion/retention model** - every server-visible datum mapped to subject(s) and retention (including push tokens and metadata), the four FR-11 deletion operations with couple-data ownership rules, manifest mechanics, processor flow-down list (DigitalOcean, Stripe, Apple, Google), informed by privacy-counsel parameters obtained at this phase's start (OQ-10). External review: the key lifecycle is reviewed per OQ-9 (a qualified applied-crypto reviewer, or verbatim adoption of a published audited scheme with documented deviations). Acceptance gate: invariant matrix signed off; every later schema PR cites the spec section it implements. 3-5 ew, medium confidence. Depends on: Phase 0; drafts may start immediately, (c) finalizes after OQ-10 parameters arrive.

**Phase 1 - Chart core.** `verelle-core` domain types and cycle bookkeeping per the research spec's vocabulary (FR-2/3/4); chart-layout logic and the golden-render suite (NFR-7): fixtures covering regular cycles, artificial-cycle stretches, return-to-cycles numbering, user-marked Peak annotation counts, missed/error readings; property tests (day numbering is total and stable under any input ordering; no panic on any observation sequence); `verelle-store` schema per Phase S; a CLI harness that replays a fixture file and prints the chart. Deliverable: the core renders every fixture correctly. Acceptance gate: golden-render suite 100% green in CI; an instructor has reviewed the chart format against real charts (A-4). 3-5 ew, medium confidence. Depends on: Phases 0, S.

**Phase 2 - Walking skeleton on the first phone (retires the architecture risk).** UniFFI bindings; Android native shell per closed OQ-2: record screen, chart view, user-configured reminders (FR-10), local CSV/JSON export. Local-only, no accounts - but crash-safe from the start: atomic observation+outbox commits, schema migrations tested up and down, storage-exhaustion behavior defined, export working before any real data is entrusted. Delivers: FR-2/3/4/5 (UI), FR-9 (basic), FR-10, FR-11 (export half), NFR-1 (local), NFR-5. Acceptance gate: a founding-couple member records a real day on a real phone; cold start < 2 s measured; UniFFI round-trip suite passes; crash-injection at the commit points loses nothing. 4-6 ew, medium confidence. **Implementation status 2026-07-20:** the Rust/Compose architecture round trip, ARM64/x86_64 builds, emulator device tests, Keystore-wrapped local dataset key, SQLite close/reopen persistence, core entry flows, deletion, export, and reminder skeleton are implemented. The rest of the supplemental-entry UI and the real-phone/manual acceptance items remain open; Phase 2 is not declared complete.

**Phase 3 - Server, accounts, E2EE sync, couple sharing (household MVP).** Implementation of the Phase S specs - the design work is already done and reviewed; this phase builds to spec. Axum server; accounts and sessions per the key lifecycle; couple invite/link/unlink with epoch rotation; append-only op log with transactional cursor; push relay with token registry (D13); freshness indicators; entitlement model present but everything free-tier while unlaunched; OpenTofu + Ansible deploy (OQ-7 decided here as an ADR); TLS; nightly encrypted backups off-droplet with the deletion manifest wired in; **restore drill executed including manifest reapplication**; fleet Prometheus/Grafana targets added. Delivers: FR-1, FR-7, FR-8, FR-11 (deletion operations), NFR-2, NFR-3, NFR-4 (measured), NFR-6, NFR-8, NFR-10. Acceptance gate: (a) two real phones, two accounts, one couple: observation recorded offline on one renders on the other's foregrounded app ≤ 10 s after reconnect at p95; (b) the model-based convergence suite is green - concurrent edit/edit, edit/delete, retries with response loss, clock skew, process death between commit and enqueue, cursor restart, restore/replay, three-device histories; (c) key-lifecycle adversarial tests pass - unlink-dark with an offline remaining device, with a restored backup, and against a replaying server; password change and recovery-code paths lose nothing; (d) deletion E2E: delete, then restore the oldest backup, prove the manifest prevents resurrection; (e) k6 meets NFR-4. 6-9 ew, low-medium confidence - this is the phase the Phase S specs exist to de-risk. Depends on: Phases 1, 2, S. *M1 measurement starts at this gate.*

**Phase 4 - Second phone platform.** SwiftUI shell (or Compose, if OQ-2 flipped Phase 2) to feature parity with Phase 2 + sync. Delivers: platform parity for FR-1..11. Gate: both founding-couple phones in daily use - couple sharing now delivers its value. 4-6 ew, medium confidence (Chart35 gave me working SwiftUI). Depends on: Phase 3. *If the household is single-platform, Phase 4 swaps order with Phase 5 freely.*

**Phase 5 - Web app.** The D6 Leptos spike (3 days, hard-boxed) → build: sign-in, chart view, record, export, account management. Delivers: web parity for FR-1..11; resolves OQ-8. Gate: spike verdict ADR'd; crypto interop verified against a phone-written account; same-core parity is structural. 1 ew spike + 4-6 ew build, low confidence (Leptos is new ground - that is partly the point). Depends on: Phase 3; parallelizable with Phase 4.

**Phase 6 - Payments.** Stripe Checkout/Billing + webhooks + entitlement enforcement + grace period + the FR-12 lapse/retention schedule with warning emails; pricing checked against comparables; the OQ-5 mobile-purchase ADR against then-current App Store/Play rules; free-tier boundaries enforced (local use stays fully free). Delivers: FR-12. Gate: test-mode lifecycle exercised end to end - purchase → unlock → lapse → grace → pause → warnings → simulated 12-month deletion; refund path documented. 3-4 ew, medium confidence. Depends on: Phase 3 (server), any client.

**Phase 7 - Public launch.** MHMDA-conformant consumer-health privacy policy built on the Phase S data inventory; the OQ-3 legal package closed (nominative trademark copy, Institute outreach, and the D1 copy/feature review confirming the marketing text and the FR-5 annotation set stay on the display side of the interpret/analyze line); incident-response and breach-notification runbook counsel-reviewed, with one tabletop (stolen server/backup credentials) run and corrective actions closed **before the closed beta begins**; store health-data declarations (Play Health Apps declaration + Data Safety form, Apple privacy nutrition labels) consistent with the privacy policy; store listings (US storefronts); closed beta (10-20 couples: the friends this app exists to help, plus the Marquette community); crash-free and NFR re-verification; then public release on App Store, Play, and web (product-doc distribution). 3-5 ew, medium confidence. **Reversible/irreversible:** everything before store submission is reversible. Submitting under the Verelle name/bundle IDs and taking the first external subscription are the points of no return (names and IDs are permanent; money creates obligations). Abort criteria before that point: any launch criterion in §6 unmet → do not submit. After it: recovery is standard ops (refunds via Stripe, incidents per the runbook), not rollback. Post-external-users, all schema changes are additive-only with a pre-deploy backup.

**Phase 8 - Watches (post-1.0).** Wear OS tile/complication + watchOS: recent chart entries, quick-record, enrolled per the watch path the Phase S key lifecycle already names. Delivers: FR-13. Gate: quick-record round-trips through sync from each watch. 5-8 ew, low confidence. Deliberately last: highest platform cost per user-value until the phone product proves M2.

**v2 - Computed status (not scheduled; blocked by OQ-11).** The research spec plus the OQ-11 gate package (FDA-counsel disposition for an interpreting feature, manual-currency verification, resolution of the spec's flagged REG-START source conflict, instructor-derived independent vectors, rule ledger, hazard analysis on every infertile-emitting transition) revives revision 2's engine plan. Nothing in v1 may ship from this scope.

## 6. Validation and operations

### Test levels and named scenarios

- **Golden-render suite** (the load-bearing v1 suite): observation fixtures → expected chart structures, covering regular cycles, artificial-cycle stretches, return-to-cycles numbering, user-marked-Peak annotation counts, missed/error readings, quantitative readings; run on every commit (NFR-7).
- **Property tests**: cycle-day numbering is a total, stable function of user-marked starts; no panic on any observation sequence or ordering; annotations never appear without their user-marked anchor event.
- **Crypto and key-lifecycle tests**: envelope round-trip across Rust-native and wasm builds; wrong-key and wrong-epoch failure modes; version-envelope forward-compat; adversarial suite from the Phase S invariant matrix - unlink-dark (offline remaining device, offline departed device, restored backup, replaying/compromised server), password change, recovery code, local-to-account import atomicity under crash injection.
- **Sync convergence suite** (model-based, from the Phase S state machine): concurrent edit/edit, edit/delete, retries before and after response loss, clock skew, process death between local commit and enqueue, cursor restart, restore/replay, three-device histories. Acceptance is convergence plus zero loss of acknowledged writes (NFR-1).
- **Store/migration tests**: SQLite migrations up and down on all platforms; storage-exhaustion behavior.
- **Push/freshness tests**: foreground, background, force-quit, notifications-disabled, Doze, network transition, stale/rotated token (D13, NFR-3).
- **End-to-end**: the Phase 3 two-phone gate script, re-run per release; Stripe test-mode lifecycle including lapse and retention (Phase 6 gate).
- **Load**: k6 sync-endpoint profile, 100 concurrent, NFR-4 threshold, run before Phase 7.
- **Restore + deletion**: the NFR-6/NFR-10 drill - runbook-driven restore to a fresh droplet, deletion-manifest reapplication proven, quarterly.
- **Incident response**: one pre-beta tabletop (stolen server/backup credentials); the malicious-client-release scenario is covered in the runbook.

### Traceability matrix

| Req | Phase | Verification |
|---|---|---|
| FR-1 | 3 | Two-phone E2E gate script (account create/sign-in both platforms) |
| FR-2 | 1, 2 | Golden-render fixtures (incl. quantitative and monitor-setup variants); record-screen E2E |
| FR-3 | 1, 2 | Golden-render fixtures; record-screen E2E |
| FR-4 | 1 | Property tests + fixtures for cycle numbering incl. artificial cycles |
| FR-5 | 1, 7 | Golden-render suite 100% green; Phase 7 legal review confirms the annotation set |
| FR-6 | 1 | Fixtures for postpartum usage patterns render correctly |
| FR-7 | S, 3 | Key-lifecycle spec + adversarial unlink-dark tests + two-phone gate |
| FR-8 | S, 3 | Sync state machine spec + convergence suite + offline E2E |
| FR-9 | 1, 3 | Instructor chart-format review (Phase 1 gate); instructor conducts a real follow-up from the app (M1) |
| FR-10 | 2 | Manual device test in Phase 2 gate checklist |
| FR-11 | S, 3 | Deletion model spec; deletion E2E incl. restore-with-manifest proof |
| FR-12 | 6 | Stripe test-mode lifecycle E2E incl. lapse → pause → warnings → deletion |
| FR-13 | S, 8 | Watch path named in key-lifecycle spec; watch quick-record round-trip test |
| NFR-1 | 2, 3 | Crash-injection at commit points; convergence suite (zero acknowledged-write loss) |
| NFR-2 | S, 3 | Key-lifecycle spec + OQ-9 external review; server-side plaintext grep in code review; interop tests |
| NFR-3 | 3 | Timed foreground propagation p95 in Phase 3 gate; push/freshness state-matrix tests; freshness indicator present |
| NFR-4 | 3, 7 | k6 run, threshold asserted |
| NFR-5 | 2 | Measured cold start in Phase 2 gate |
| NFR-6 | 3, quarterly | Restore drill runbook executed incl. manifest reapplication, logged |
| NFR-7 | 1 | Golden-render suite in CI, blocking; instructor chart-format review recorded |
| NFR-8 | 3 | DO invoice ≤ $20/mo, checked monthly |
| NFR-9 | 2-7 | Dependency review in each release checklist; no analytics SDK in lockfiles; push payloads inspected in E2E |
| NFR-10 | S, 3 | Deletion model spec; drill proves live + backup deletion within bounds; processor flow-down list on file |
| D1 discipline | every release | Release checklist item: no shipped feature computes or displays what the data means; any candidate goes to OQ-11 |

### Observability

Reuse the existing fleet stack (Prometheus/Grafana/Alertmanager, already alerting via email + Twilio SMS): node exporter and postgres_exporter on the Verelle droplet, blackbox probe of `/healthz`, a backup-freshness metric (alert if the newest off-droplet backup is > 26 h old), a deletion-manifest job metric, Axum request metrics (rate/errors/duration), push-provider response metrics (token failures, throttling). Logs: `tracing` JSON to journald, request metadata only - never bodies, never plaintext health data (structurally absent anyway), emails scrubbed to account IDs, 30-day retention. Client crash reporting: store-native only (Play Console, App Store Connect) - no third-party SDK, per NFR-9. Paging: me, via the existing Alertmanager routes.

### Incident response (operational control for C-4 / HBNR)

A written incident-response and breach-notification runbook, counsel-reviewed before the Phase 7 closed beta: incident classification (metadata exposure vs key compromise vs client-build compromise), containment and credential/key rotation steps, evidence preservation that adds no sensitive content to logs, the notification decision tree mapping user / FTC / state / processor notices to their deadlines with message templates, processor contacts (DigitalOcean, Stripe, Apple, Google), counsel escalation contact, and a named backup human contact. Targets recorded in the runbook: detection-to-triage ≤ 24 h, triage-to-counsel ≤ 72 h for any suspected covered breach. One tabletop (stolen server/backup credentials) runs pre-beta with corrective actions closed; the malicious-release scenario is documented in the runbook.

### Launch criteria (Phase 7 ship/no-ship, distinct from M1-M3)

1. Golden-render suite 100% green; instructor chart-format review recorded (NFR-7 / FR-9).
2. The OQ-3 legal package closed: nominative trademark copy approved, Institute outreach done, and the D1 copy/feature review confirms the marketing text and FR-5 annotation set stay on the display side of the interpret/analyze line.
3. Restore + deletion drill passed within the last quarter, manifest reapplication included (NFR-6, NFR-10).
4. MHMDA-conformant privacy policy published from the Phase S data inventory; in-app deletion verified (FR-11, C-4).
5. Incident-response runbook counsel-reviewed; tabletop completed, corrective actions closed.
6. Store health-data declarations submitted and consistent with the privacy policy (Play Health Apps + Data Safety; Apple privacy labels).
7. Closed-beta crash-free sessions ≥ 99.5% over the final two beta weeks.
8. k6 NFR-4 run passed on the production droplet size.

### Post-launch review and operations

M1 is read at Phase 3 + 3 months (continue/iterate/stop on public investment); M2 at launch + 3 months and M3 at payments + 6 months (together they decide whether Verelle is a product or an apostolate that breaks even). I am the owner and the only operator: backups nightly (verified by the freshness alert), retention jobs (lapse schedule, log expiry, token cleanup) monitored, dependency updates via a monthly Renovate batch, store-compliance sweeps each Apple/Google policy season, quarterly restore + deletion drills. The local-first design is also the succession plan: if the operator disappears, installed apps keep working and export keeps working; that promise goes in the public docs.

## 7. Risks and pre-mortem

Six months in, Verelle failed. The most plausible stories, with the plan's answer:

1. **Scope ate the solo developer.** Five client surfaces, a novel crypto design, and payments, at 5-10 h/week. *Answer:* MVP is Phase 3 on the household's own phones; watches are post-1.0 by plan; each phase has a hard gate so a stall leaves a working smaller product, not rubble. Early-warning signal: a phase exceeding 2× its effort estimate → cut surface (web or second platform waits), do not stretch.
2. **The career-plan exception quietly expands.** Decision 4's "no new side projects ship for 12 months" was written 2026-06-10 for good reasons; on 2026-07-18 I made a deliberate, scoped exception for Verelle (C-2) because it exists to help friends. The failure mode is the exception swallowing the rule: Verelle hours displacing the job-search workstream the career plan exists to protect. *Answer:* the exception is written down and scoped to this project. Early-warning signal: a week where Verelle work displaces a planned job-search action (an application, an interview prep, a tracker touch) → Verelle pauses that week, not the search.
3. **Interpretation creeps back in.** One "helpful" hint at a time - a testing-window suggestion here, a highlighted day there - until the app is computing fertility again without ever having decided to. *Answer:* the D1 feature-discipline rule is a per-release checklist item (§6 traceability, last row); any feature that tells the user what her data means goes through the OQ-11 gate package or does not ship. Early-warning signal: any UI proposal whose copy contains "fertile," "infertile," "safe," or "should" applied to a day.
4. **A mis-rendered chart misleads a couple.** v1 has no algorithm to get wrong, but a chart that drops a reading, mis-numbers a day, or mis-anchors a P-count could still distort the couple's own interpretation. *Answer:* the golden-render suite pins layout to fixtures in CI; the instructor chart-format review (Phase 1 gate) and M1's real follow-up validate against practice; NFR-1's convergence suite guarantees the chart shows every acknowledged observation. Residual risk is real and named: display software still carries display bugs.
5. **Silent write loss breaks the founding promise.** Two offline edits to the same day, a retry after a lost response, a tombstone racing an edit - and an acknowledged observation quietly vanishes, discovered only after the chart influenced a decision. *Answer:* the append-only op log with client-side deterministic merge (D11) makes convergence a pure function, and the model-based convergence suite is a Phase 3 acceptance gate, not an aspiration. Early-warning signal: any manual data repair during household use is treated as a sev-1 against NFR-1.
6. **A privacy or security incident outruns the operator.** Not necessarily a breach - a stolen credential, a bad restore that resurrects deleted data, an SDK that crept in. *Answer:* NFR-9 checked per release; the deletion manifest survives restores by construction; the counsel-reviewed IR runbook with deadlines and a tabletop exists before any external user does; D5 keeps the worst case structurally small.

## 8. Open questions and gates

### Gates

| Gate | Status | Detail |
|---|---|---|
| **G1** | **CLOSED 2026-07-18** | Jacob's written decision (C-2): proceed now as a deliberate, scoped exception to career-plan Decision 4, because Verelle exists to help friends. Remaining action: Jacob annotates the career plan itself, outside a working session. Residual risk tracked as §7 story 2. |
| **G2** | **CLOSED 2026-07-18, by re-scope** | Jacob chose disposition (c) of revision 2's D1: computed fertility status is removed from the shipped v1 product. v1 is record-and-display (D1), which sits outside the interpret/analyze line the device definition draws. The pre-launch legal copy/feature review (launch criterion 2) confirms the posture as a checklist item; the full counsel disposition moves to the v2 gate package (OQ-11). |
| **G3** | **RE-SCOPED 2026-07-18** | The acquired source package - docs/marquette-method-business-logic-specification-for-verelle.md, with pinned public sources (regular-cycles manual, Clearblue booklet, the 2005/2013/2023 protocol papers, USCCB history paper) - satisfies the acquisition half. v1 uses it only as vocabulary and data-model reference, which blocks nothing. The residue moves to OQ-11: confirm the third-party-hosted manual copy matches the currently taught revision, resolve the spec's flagged REG-START source conflict (manual's earliest-Peak-minus-six vs Mu 2022's earliest-High), and obtain instructor-derived independent vectors. |

No gate blocks the v1 build path. The plan is READY for the v1.0 scope; OQ-11 gates v2.

### Open questions

| ID | Question | Owner | Resolution gate | Blocks |
|---|---|---|---|---|
| OQ-1 | Career-plan reconciliation | Jacob | **Closed 2026-07-18** - see G1 and C-2 | Nothing |
| OQ-2 | Founding couple's phones (orders Phases 2/4) and watch platforms (scopes Phase 8) | Jacob | **Closed 2026-07-20:** both founding-couple phones are Android; Android is Phase 2 and iOS is Phase 4. Wear OS (Samsung Watch8) is the known founding watch. iPhone and Apple Watch test hardware is also available for the second-platform and Phase 8 paths. See ADR 0004. | Nothing |
| OQ-3 | The pre-launch legal package: nominative use of "Marquette Method" given Marquette NFP™ Pro, Boland Institute outreach, and the D1 copy/feature review of marketing text and the FR-5 annotation set | Jacob (+ 1-2 hr legal consult) | Reviewed checklist + outreach record | Phase 7 store submission |
| OQ-4 | Regulatory disposition for computed status | Jacob | **Closed for v1 2026-07-18** by the G2 re-scope; reopens inside OQ-11 for v2 | Nothing in v1 |
| OQ-5 | iOS/Android purchase path: IAP at 15%, US external links at 12%+, or web-only subscribe - against the rules in force at Phase 6 | Jacob | ADR at Phase 6 open | Phase 6 mobile purchase UX |
| OQ-6 | Mira and Clearblue-supply watch: when does quantitative-monitor support beyond raw recording matter? | Jacob | Recheck availability each quarter; ask the instructor at the Phase 1 chart review | v1.1+ scope only (schema already ready per D3) |
| OQ-7 | Dedicated droplet vs colocation on the stephens.page host (D10 recommends dedicated from Phase 3) | Jacob | Infra ADR at Phase 3 start | Phase 3 deploy target |
| OQ-8 | Leptos or the TypeScript fallback for web | Jacob | The D6 spike verdict, 3 days, ADR'd | Phase 5 build |
| OQ-9 | Key-lifecycle external review path: a qualified applied-crypto reviewer (budget from C-5), or verbatim adoption of a published audited scheme with documented deviations | Jacob | Reviewer engaged or scheme adopted, recorded in the Phase S spec | Phase S sign-off |
| OQ-10 | Privacy-law parameters for the deletion/retention model: live-system deletion deadline, treatment of couple-shared data subjects, HBNR applicability mapping per data flow | Jacob + privacy counsel | Counsel parameters memo at Phase S start | Phase S deletion-model finalization; Phase 7 |
| OQ-11 | The v2 computed-status gate package: FDA-device-counsel disposition for an interpreting feature (revision 2's D1 process), manual-currency verification, resolution of the REG-START source conflict, instructor-derived independent boundary vectors, rule ledger, and hazard analysis per revision 2's Phase 1 design | Jacob | All items closed and recorded before any interpreting feature ships | v2 computed status only; nothing in v1 |

What I do not yet know, and say so: whether the friends and the wider Marquette community will adopt a chart that deliberately does not tell them what it means (M2 is the test - my bet is that instructed couples, who were taught to interpret, are exactly the users who do not need the app to do it), whether the couple-key crypto design survives its external review without a redesign (Phase S's gate exists for exactly that), and whether v2's computed status will ever clear its gate package (OQ-11 - a question this plan no longer needs answered to ship).

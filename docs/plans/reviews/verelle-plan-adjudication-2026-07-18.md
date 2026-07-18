# Adjudication: adversarial review of the Verelle plan

*Adjudicator: the plan's author (Claude, on Jacob's behalf), 2026-07-18. Plan adjudicated: docs/plans/verelle-plan.md revision 1 (SHA-256 45b01d138f96a2eb6440307db0e312a320a77db44d4657777f50bd5abfe1fae9, 256 lines - matches the review's pin exactly; no version skew). Review adjudicated: docs/plans/reviews/verelle-plan-adversarial-review-2026-07-18.md (7 findings, B1-B7, verdict REJECT). Original preserved at docs/plans/reviews/verelle-plan-original-2026-07-18.md; the revised plan is applied at docs/plans/verelle-plan.md (revision 2).*

*Independent verification performed for this adjudication (2026-07-18): the Marquette model page was fetched and confirmed to publish no operational protocol rules (decisive for B2); RCW 19.373 was fetched and confirmed to extend deletion to archived/backup systems with a six-month ceiling and processor flow-down (decisive for B5), while also correcting revision 1's "private right of action" phrasing (enforcement runs through the WA Consumer Protection Act, RCW 19.86); the FDA PYT classification page returned 404 through the fetcher, but the Class II category (21 CFR 884.5370) was already established at plan time from the Natural Cycles De Novo DEN170052, which is sufficient for B1's premise. Apple background-push and Android Doze behavior (B6) are accepted from the platform documentation the review cites, consistent with prior knowledge.*

## Intent and constraints

Verelle is a cross-platform Marquette Method charting app for couples, per docs/verelle.md: Rust shared core, Rust + Axum server, PostgreSQL, UniFFI-bound Kotlin/Compose and Swift/SwiftUI shells, Leptos-or-TypeScript web, accounts usable on web, Android + Wear OS, and iOS + watchOS, domain verelle.app, Stripe-to-Mercury freemium payments, GitOps delivery (GitHub Actions, OpenTofu, Ansible, DigitalOcean, Cloudflare DNS, Porkbun), distribution via App Store, Play Store, and website, feminine blue-leaning style. Those are the non-negotiables; the plan's FR/NFR set, phasing, E2EE posture, and gates are plan-level decisions open to revision. Inferred (not stated in docs/verelle.md): solo part-time developer; the founding couple as first users; the career-plan conflict (C-2) - all held over from revision 1 and unchallenged by the review.

## Finding dispositions

| ID | Disposition | Severity | Evidence | Required action |
|---|---|---|---|---|
| B1 | PARTIALLY ACCEPT | Critical | 21 CFR 884.5370 / product code PYT (Class II) established via DEN170052; rev-1 D1 rested on competitor behavior, which proves enforcement posture, not exemption; rev-1 gated legal review at Phase 7, after 14-22 ew of computed-status investment. Rejected part: blocking household use - FDA jurisdiction attaches to devices introduced into commercial distribution, and a self-built tool used privately by its author's household is not that; the reliance-safety concern is handled by shadow mode instead. | New Phase R: intended-use memo + device-counsel written advice + recorded disposition with stop/re-scope criteria (gate G2). G2's consult step blocks Phase 1 status coding; full closure blocks any external user, marketing, and Phase 7. Household use continues in shadow mode (M1 reworded). 513(g) kept as counsel-advised escalation, not mandatory. |
| B2 | PARTIALLY ACCEPT | Critical | Verified by fetch: the cited marquette.edu model page describes the method and publishes no fertile-window rules, day counts, or postpartum instructions - the rev-1 corpus gate had no authoritative source under it; Marquette-hosted publications show multiple protocol revisions (2005/2013/2023), so version pinning is real. Rejected part: "license the rules" framing - published method rules are not themselves licensable expression; recast as documented IP basis with counsel plus Institute outreach (OQ-3). | New gate G3: acquire complete current authoritative protocol materials; pin title/issuer/revision/effective date per protocol. Phase 1 gains the rule ledger (rule → pinned source → vectors), instructor-independent derivation of boundary-case expected outputs, hazard analysis + second check on every infertile-emitting transition, conservative defaults (FR-5). G3 failure stops the computed-status feature. |
| B3 | ACCEPT | High | Verified by inspection of rev-1 D11/data model: the HLC sat inside ciphertext so the server could not perform the LWW it was assigned; record_id dedupe would reject legitimate edits; a single EncryptedRecord row implied a server upsert choosing winners by arrival order. Contradictory semantics, exactly as the review said; silent loss of acknowledged writes violates NFR-1 and M1. | D11 rewritten: append-only encrypted op log, immutable client-generated op_id for idempotency, logical record key inside ciphertext, deterministic client-side merge (HLC then device-ID tiebreak), tombstones as ops, transactional cursor, bootstrap by replay, no server conflict resolution. Sync state machine specified in new Phase S; model-based convergence suite is a Phase 3 acceptance gate covering all the review's named scenarios. |
| B4 | PARTIALLY ACCEPT | High | Rev-1 sequenced the key-lifecycle design inside Phase 3, after Phase 1 froze schema and Phase 2 accepted real household data; local-to-account import, password change, recovery, epoch handling for queued old-key writes, and multi-device enrollment were all unspecified. The unlink-darkness claim did depend on unstated epoch semantics. Rejected part: mandatory independent-cryptographer engagement as the only acceptable review - right-sized to OQ-9 (qualified reviewer, or verbatim adoption of a published audited scheme with documented deviations), budgeted in C-5. | New Phase S key/membership lifecycle spec (all states the review lists, plus watch enrollment per NEW3) written before the Phase 1 schema, externally reviewed per OQ-9, with an invariant matrix; adversarial tests (unlink-dark with offline devices, restored backup, replaying server; crash-injected import; password change; recovery) are Phase 3 acceptance gates. Phase 2 additionally hardened (atomic commits, migration up/down, storage exhaustion) before real data. |
| B5 | ACCEPT | High | Verified by fetch: RCW 19.373 deletion extends to "archived or backup systems" (delay capped at six months from an authenticated request) and flows down to processors and third parties. Rev-1's deletion E2E checked live rows only; couple-shared-data subject rights, backup resurrection, and processor propagation were unaddressed. "The server only has ciphertext" is not a compliance substitute. | New Phase S data inventory + deletion/retention model: four distinct deletion operations (FR-11), couple-data ownership rules, DeletionManifest reapplied after every restore, 30-day backup expiry, processor flow-down list, retention table in §4, NFR-10 added. Deletion E2E now includes restoring the oldest backup and proving the manifest prevents resurrection. Counsel parameters via OQ-10 (folded into the existing Phase R legal engagement, not a new one). |
| B6 | ACCEPT | Medium | Rev-1 NFR-3 promised ≤ 10 s to any "online device" and named no push infrastructure; Apple documents background pushes as low-priority/not guaranteed and Android Doze defers background network - the uniform SLO was unkeepable and the delivery dependency unplanned. | NFR-3 split: foreground-to-foreground ≤ 10 s p95 (measured end to end); background best-effort + sync-on-resume + mandatory last-synced indicator; new D13 adds APNs/FCM as named dependencies with token lifecycle, opaque payloads, provider metrics; push/freshness state-matrix tests (foreground/background/force-quit/notifications-off/Doze/stale token) added to §6. |
| B7 | PARTIALLY ACCEPT | Medium | Rev-1 cited HBNR in C-4 and "incident response per §6" in Phase 7, but §6 contained no incident-response control at all - a real gap for a rule that sets notification deadlines and puts the compliance burden on the vendor. Rejected part: two mandatory tabletops - one pre-beta tabletop (stolen server/backup credentials) is proportionate for a solo pre-launch operator; the malicious-release scenario is covered in the runbook; counsel review folds into the existing legal package rather than a separate engagement. | §6 gains an incident-response section: counsel-reviewed runbook (classification, containment, evidence preservation, notification decision tree with deadlines and templates, processor and counsel contacts, named backup contact, detection-to-triage ≤ 24 h and triage-to-counsel ≤ 72 h targets) plus one tabletop with corrective actions closed, both gated pre-beta in the Phase 7 launch criteria. |
| NEW1 | ACCEPT | Low | Rev-1 FR-12 gated sync on subscription and defined a 7-day grace, but nothing after it: no statement of what happens to server-held ciphertext, couple links, or the user's data when payment stops - a spec gap touching both fairness and retention law. | FR-12 now defines lapse: sync pauses, nothing deleted; lapsed ciphertext retained 12 months with two warning emails, then deleted per the §4 retention table; the Phase 6 gate exercises the full lapse path with a simulated clock. |
| NEW2 | ACCEPT | Low | Rev-1's Phase 7 checklist omitted the store-side health-data paperwork both stores require for this category: Google Play's Health Apps declaration and Data Safety form, Apple's privacy nutrition labels - late discovery would stall submission. | Launch criterion 7 added: declarations submitted and consistent with the privacy policy, verified in the Phase 7 checklist. |
| NEW3 | ACCEPT | Low | Rev-1 deferred watches to Phase 8 but the key lifecycle it planned in Phase 3 never mentioned watch enrollment; retrofitting key distribution to a new device class after epochs are live risks exactly the redesign B4 warns about. | FR-13 and the Phase S key-lifecycle spec must name the watch-enrollment path now (one requirement, no implementation); Phase 8 design cites it unchanged. |

## Missed findings

Three NEW findings, adjudicated in the table above: NEW1 (subscription-lapse data lifecycle unspecified), NEW2 (store health-data declarations missing from launch criteria), NEW3 (watch enrollment absent from the key lifecycle). Candidates considered and folded rather than counted: treating account metadata and push tokens as consumer health data (folded into B5's data-inventory action and the §4 threat model - it is a consequence of the same inventory, not a separate defect); local schema migration/rollback testing (the review itself carried this in its revised-plan outline step 4; folded into B4's Phase 2 hardening). No other material misses found: cost, payments, web-framework, and trademark lenses were checked and are either verified in the plan or already gated (OQ-3, OQ-5, OQ-8).

## Disagreements

- **B1 (partial):** The defect stands - revision 1 bet the project on an unverified regulatory premise and scheduled the check last. Two remedy elements fail on evidence. First, blocking M1/household use: FDA device jurisdiction attaches to products introduced into commercial distribution; a developer's household privately using self-built software is not a marketed device, so the legal trigger the review invokes does not reach it. The legitimate safety residue of that concern (a couple relying on unvalidated output) is addressed by re-defining M1 as shadow-mode alongside their existing instructor-taught practice, with reliance gated on Phase 1 sign-off plus G2. Second, the 513(g) framing is kept as the review itself qualified it - an escalation "if a formal classification view is needed," not a default step; it carries a real FDA user fee and counsel may resolve the question without it.
- **B2 (partial):** The core stands and was independently verified: the named source cannot ground the corpus, versions must be pinned, and vectors must be derived independently of the implementer's inference. The "confirm the right to implement and distribute the resulting rules" element overstates the legal position - method rules as such are not licensable subject matter, and a licensing gate framed that way could block the project on a non-existent requirement. What survives of that concern: teaching materials are copyrighted, instructor materials may carry contract terms, and the Institute relationship matters commercially - so the revision requires a documented IP basis for the transcription (counsel, OQ-3) and Institute outreach, without granting the Institute a veto the law does not give it.
- **B4 (partial):** Everything about ordering and missing lifecycle states is accepted. "Have an independent application cryptographer review the design" is right-sized rather than adopted verbatim: for a solo project with a ~$3k professional-services envelope (C-5), OQ-9 allows either a qualified external reviewer or strict adoption of a published, audited scheme with documented deviations. A mandatory bespoke cryptographer engagement is more assurance than the delta over an audited published design justifies at this scale.
- **B7 (partial):** The runbook, counsel review, pre-beta gate, and one tabletop are accepted. The second mandatory tabletop (malicious client release) is trimmed to a documented runbook scenario: the marginal preparedness gain over a documented procedure does not justify a second full exercise for a one-person response team pre-launch. It becomes a natural candidate for the first post-launch drill cycle.
- **Self-correction surfaced during verification (not a review finding):** revision 1 described MHMDA as carrying "a private right of action." RCW 19.373 routes enforcement through the WA Consumer Protection Act (AG enforcement; consumer suits under RCW 19.86). Revision 2's C-4 states it precisely.

## Readiness

**CONDITIONALLY READY.** The review's REJECT verdict was correct for revision 1's sequencing; revision 2 restructures so every critical-or-high uncertainty sits behind a named gate that blocks specific steps, with all remaining work (Phases 0, R, S) safe to execute regardless of gate outcomes.

| Gate | Blocks | Rejection criterion |
|---|---|---|
| **G1 - career-plan reconciliation (OQ-1)** | Phases 1-8; Phases 0/R/S exempt | Decision is "not this year" → shelve; Phase 0/R/S artifacts retain value for any future start |
| **G2 - regulatory disposition (OQ-4), worst-case critical** | Counsel-consult step blocks Phase 1 status-computation coding; full closure blocks any external user, marketing claims, Phase 6 public activation, and Phase 7 | Counsel concludes a Class II pathway is required, funding it is infeasible, and record-and-display re-scope is unacceptable → stop. Re-scope accepted → FR-5 computed status is removed from the shipped product and the plan re-enters adjudication |
| **G3 - protocol source package (feeds NFR-7), worst-case critical** | Phase 1 | Current authoritative materials or a credentialed reviewing instructor cannot be secured → computed-status feature stops; record-and-display may proceed |

No accepted or partially accepted finding remains unincorporated; no DEFER dispositions were needed because every external uncertainty is carried as one of the three gates above, each with owner, closure mechanism, blocked steps, and rejection criterion, and the blocked phases are marked as blocked inside the revised plan itself.

## Revised plan

The complete replacement plan follows verbatim; it is also applied at docs/plans/verelle-plan.md (revision 2).

---

# Plan: Verelle (revision 2)

*Author: Jacob Stephens. Revision 2, 2026-07-18, produced by adjudicating the adversarial review at docs/plans/reviews/verelle-plan-adversarial-review-2026-07-18.md; the adjudication record is docs/plans/reviews/verelle-plan-adjudication-2026-07-18.md and revision 1 is preserved at docs/plans/reviews/verelle-plan-original-2026-07-18.md. External claims verified 2026-07-18 unless noted. Readiness: CONDITIONALLY READY - Phases 1 and later are blocked by gates G1-G3 (§8) until closed.*

## 1. Summary

Verelle is a cross-platform charting app for couples using the Marquette Method of natural family planning: one Rust protocol engine behind native shells (Kotlin/Jetpack Compose on Android, Swift/SwiftUI on iOS, Leptos on web, watches after 1.0), a Rust + Axum sync server over PostgreSQL, and end-to-end encryption so the server only ever stores ciphertext. The smallest version that delivers real value is the founding couple charting daily on their own two phones with shared visibility and zero data loss.

Revision 2 restructures the front of the plan around the two questions that could end the project, moving both ahead of engine code: whether computed fertility status can ship to the public without an FDA Class II pathway (Phase R, gate G2), and whether authoritative, versioned Marquette protocol sources can be acquired to ground the correctness gate (Phase R, gate G3) - the Boland Institute's public model page describes the method but publishes no operational rules (verified 2026-07-18). A specification phase (Phase S) then pins the three interlocking lifecycles - sync state machine, key/membership lifecycle, deletion/retention model - before any schema freezes, because all three were underspecified in revision 1 in ways that contradicted its own durability, privacy, and compliance promises. Until gates close, the app is built and used in shadow mode: recorded alongside the couple's existing instructor-taught practice, never as the thing they rely on.

## 2. Outcome and requirements

### Intended outcome

A couple can run the Marquette Method day to day - record the monitor reading and supplemental markers, see today's fertility status, and both see the same chart - on whatever device is in reach, offline, without surrendering plaintext health data to any server, including mine. Target users: instructed Marquette Method couples, starting with my own household, then the broader Marquette community (instructor-referred couples, the method's active online groups).

### Success metrics (post-launch value, distinct from the launch criteria in §6)

| ID | Metric | Baseline | Target | Measurement window |
|---|---|---|---|---|
| M1 | Founding couple records daily observations in Verelle alongside their existing instructor-taught charting practice (shadow mode): zero lost acknowledged observations, zero unexplained divergences between engine output and the instructor-validated interpretation | none measured | ≥ 60 consecutive days, 0 losses, 0 unexplained divergences | within 3 months of the Phase 3 acceptance gate |
| M2 | External weekly-active accounts | 0 | ≥ 25 | within 3 months of public launch (Phase 7) |
| M3 | Active paid subscriptions | 0 | ≥ 20 | within 6 months of payments launch (Phase 6) |

M1 is the kill-or-continue gate for public investment. Engine output is not relied on for family-planning decisions until the Phase 1 instructor sign-off and gate G2 are both closed; shadow mode is the household posture until then.

### Functional requirements

- **FR-1** Create an account (email + password) and sign in on any supported platform. Local-only use without an account works on every platform (account-optional, the Chart35 posture).
- **FR-2** Record a daily Clearblue Fertility Monitor reading (Low / High / Peak) against a date. The observation model must also accept quantitative hormone readings (numeric E3G / LH values) so Mira-class monitors can be added without a schema migration (see D3 and OQ-6).
- **FR-3** Record supplemental markers per date: LH test strip result, bleeding/menstruation, intercourse, optional mucus observation, optional temperature, free-text note.
- **FR-4** Cycles start on the first day of true menses; current and historical cycles are viewable.
- **FR-5** Compute and display today's fertility status (fertile / infertile / learning-phase / no-result) and the current cycle's fertile-window bounds per the pinned protocol sources acquired under gate G3, with every implemented rule traced in a rule ledger (rule → pinned source location → independently derived test vectors). Ambiguous or missing inputs resolve conservatively: toward fertile or an explicit no-result, never a defaulted infertile.
- **FR-6** Support the Marquette postpartum/breastfeeding protocol in addition to regular cycles, each pinned to a specific protocol revision under G3. Which protocol ships first is gated on OQ-2 (which protocol the founding couple needs at first use).
- **FR-7** Couple sharing: link exactly two accounts by invite code; both partners read and write the shared chart with per-entry attribution; unlink takes effect immediately per the Phase S key lifecycle - the key epoch is advanced, the server rejects old-epoch pushes from that point, and the departing partner has no access to post-unlink data.
- **FR-8** Multi-device sync for one account and across the linked couple, offline-first: every client is fully functional with no network and reconciles when connectivity returns per the Phase S sync state machine.
- **FR-9** Cycle chart visualization: monitor readings plus markers per cycle, in a form an instructor can read during a follow-up.
- **FR-10** Local reminder notification for the monitor testing window.
- **FR-11** Data export (CSV and JSON) from any client, plus four distinct deletion operations, each defined in the Phase S deletion model: (a) delete a single observation, (b) unlink from a couple, (c) delete one account, (d) destroy a whole couple dataset. Server-side deletion is effective across live systems and, via the deletion manifest, across backups within the statutory bound (WA MHMDA permits delaying backup deletion at most six months from an authenticated request, RCW 19.373; our 30-day backup expiry keeps the practical bound near 30 days). Apple requires in-app account deletion (App Store Review Guideline 5.1.1(v)).
- **FR-12** Freemium billing: local single-user use is free forever; sync, couple sharing, and encrypted backup require a subscription paid via Stripe (settling to the Stephens Page LLC Mercury account). Entitlement is enforced server-side. Lapse behavior is defined: 7-day grace, then sync pauses (nothing is deleted); lapsed-account ciphertext is retained 12 months with two warning emails, then deleted per the retention table in §4.
- **FR-13** Watch apps (Wear OS, watchOS): today's status at a glance and quick-record of the monitor reading. Post-1.0; the Phase S key lifecycle must already name the watch-enrollment path so Phase 8 does not force an epoch redesign.

### Nonfunctional requirements

- **NFR-1** Recording an observation succeeds with zero network connectivity, 100% of the time, and no acknowledged local write is ever lost - including across concurrent edits, edit/delete races, retries with response loss, process death between local commit and enqueue, cursor restarts, and backup restores. Verified by the Phase 3 convergence suite, not by a single happy-path test.
- **NFR-2** Zero-knowledge server: all health observations are encrypted on-device (AES-256-GCM envelope, versioned format) before upload; encryption keys never leave clients; the server can produce only ciphertext plus account metadata under any compulsion.
- **NFR-3** Freshness, split by client state. Foreground-to-foreground: an observation committed on one partner's device renders on the other partner's foregrounded device in ≤ 10 s at p95, measured end to end. Background/suspended clients: best-effort push invalidation plus sync-on-resume, with no hard latency promise (Apple documents background pushes as low-priority and not guaranteed; Android Doze defers background network). Every chart surface shows a last-synced freshness indicator.
- **NFR-4** Sync API p95 latency < 300 ms at 100 concurrent users on a 2 GB DigitalOcean droplet (k6, measured before public launch).
- **NFR-5** Cold start to the record screen < 2 s on a mid-range Android phone.
- **NFR-6** Durability: nightly encrypted PostgreSQL backups shipped off-droplet with 30-day expiry; a restore drill - including reapplication of the deletion manifest - demonstrated before household daily use begins and re-run quarterly.
- **NFR-7** Engine correctness: 100% pass on a conformance corpus of golden vectors derived from the pinned protocol sources (G3), where boundary-case expected outputs are derived independently by a credentialed Marquette instructor before seeing engine output; the corpus runs in CI on every commit, and every rule in the engine appears in the rule ledger.
- **NFR-8** Infrastructure cost ≤ $20/month pre-revenue (excludes the $99/yr Apple Developer fee, one-time $25 Play fee, and the one-off professional-services budget in C-5).
- **NFR-9** No third-party analytics, advertising, or tracking SDK in any client, ever (the FTC's Premom enforcement is the named cautionary case - https://www.ftc.gov/news-events/news/press-releases/2023/05/ovulation-tracking-app-premom-will-be-barred-sharing-health-data-advertising-under-proposed-ftc, verified 2026-07-18). Push notifications carry opaque "sync now" payloads only, never health data; push tokens are treated as consumer health data in the §4 inventory because possession of a Verelle account is itself health-revealing.
- **NFR-10** Deletion completeness: an authenticated deletion request is effective across live stores within 30 days and across backups within the backup-expiry window (30 days, ceiling 6 months per RCW 19.373), proven by the restore-with-manifest drill, and propagated to processors per the §4 inventory.

### Non-goals (v1.0)

- Perimenopause protocol, and full Mira quantitative protocol support (data model accepts the readings; the protocol logic is v1.1+, OQ-6).
- Sympto-thermal or Creighton method support - Chart35 already serves Creighton; Verelle stays Marquette-only.
- HealthKit / Health Connect integration.
- Instructor portal, in-app messaging, or any marketplace.
- AI/ML cycle prediction of any kind. The engine is the pinned deterministic protocol, full stop.
- Freshness guarantees for backgrounded or suspended clients (see NFR-3); Verelle promises offline correctness, not push immediacy.
- Desktop apps, localization beyond English, and non-US storefronts at launch (expansion revisited post-1.0; GDPR work deferred with it).
- Pregnancy-mode tracking (a likely v1.x feature; deferred).

### Constraints and assumptions

Constraints:

- **C-1** Solo developer, nights-and-weekends hours, competing directly with my day job and the active job-search workstream in career-advancement-plan.md. Sustained capacity is realistically 5-10 focused hours/week, and some weeks it is zero.
- **C-2** My 2026 career plan (Decision 4, 2026-06-10) currently rules: "no new side project ships for 12 months." Verelle-the-shipped-product conflicts with it head-on. Planning does not. Resolving this is gate G1 (OQ-1) and it blocks Phase 1, not Phases 0/R/S.
- **C-3** Stack directions fixed by docs/verelle.md: Rust core, Rust + Axum server, PostgreSQL, UniFFI bindings, Kotlin/Compose and Swift/SwiftUI shells, Leptos-or-TypeScript web, domain verelle.app, Stripe → Mercury, GitOps on GitHub Actions + OpenTofu + Ansible + DigitalOcean + Cloudflare DNS + Porkbun.
- **C-4** Regulated-adjacent domain: FDA product code PYT / 21 CFR 884.5370 (software application for contraception, Class II, created by the Natural Cycles De Novo DEN170052) is the classification any computed-fertility-status product must be evaluated against; the FTC Health Breach Notification Rule applies to fertility apps (Premom); Washington's My Health My Data Act (ch. 19.373 RCW, in force 2024-03-31) applies to any WA consumer's data, extends deletion to archived and backup systems with processor flow-down, and is enforced by the WA Attorney General and through consumer suits under the state Consumer Protection Act (RCW 19.86); Apple 5.1.1(v) requires in-app account deletion.
- **C-5** One-off professional-services budget of up to ~$3,000, authorized before Phases R and S begin: FDA-device-counsel consult, privacy-counsel parameters (OQ-10), and an applied-cryptography design review (OQ-9). A 513(g) FDA classification request, if counsel advises one, carries an additional FDA user fee at the then-current schedule and is a separate go/no-go decision inside G2.
- **A-1** The founding couple are the first two users; their phones and their operative protocol at first use decide platform order and Phase 1 protocol priority (OQ-2).
- **A-2** Mac access is sufficient for iOS/watchOS builds and submission (the Chart35 arrangement).
- **A-3** The Clearblue Fertility Monitor remains purchasable (in stock at major retailers, verified 2026-07-18; Walgreens has delisted it - watch item, feeds OQ-6).
- **A-4** A certified Marquette instructor is available to review the spec and independently derive boundary vectors, and the couple's own instruction provides or leads to the current authoritative protocol materials (commissioned if necessary; instructor budget ≤ $200, inside C-5's envelope). If neither materials nor instructor can be secured, G3 fails and the computed-status feature stops.

## 3. Design decisions

**D1 - Product posture: charting tool for instructed couples, held as a hypothesis until counsel confirms it.** The planned function - transforming a user's observations into a daily fertile/infertile status that couples use to avoid pregnancy - is close enough to the FDA's Class II category (PYT, 21 CFR 884.5370, created by Natural Cycles' De Novo DEN170052, https://www.accessdata.fda.gov/cdrh_docs/pdf17/DEN170052.pdf, verified 2026-07-18) that the difference cannot be assumed away. Revision 1 leaned on the existence of unchallenged competitor charting apps; that is evidence of enforcement posture, not of an exemption, and it is retired as a rationale. Phase R therefore produces: an exact intended-use statement (claims, output semantics, avoid/achieve workflows), written advice from FDA-device counsel, and one of three dispositions - (a) a documented non-device or enforcement-discretion basis covering the actual workflow, (b) a funded regulatory plan with the required controls, or (c) re-scope to record-and-display (computed status removed from the shipped product). A 513(g) request to FDA is the escalation path if counsel wants a formal view. Until G2 closes: no external user, no marketing claims, no store submission; household use continues in shadow mode only. Alternatives considered: pursuing Class II clearance outright (rejected: the Natural Cycles evidence base - a 15,570-woman clinical dataset - is beyond solo-project economics unless counsel says it is unavoidable, in which case disposition (b) or (c) applies).

**D2 - Greenfield Rust core rather than extending the Chart35 estate.** Alternatives: (a) build Marquette support into Chart35's existing TypeScript/Swift/Kotlin three-implementation stack and Node sync server; (b) greenfield one-Rust-core architecture per docs/verelle.md. Chosen: (b), per explicit product-doc direction, with the conflict recorded rather than hidden: (a) is the boring default and would reuse a proven zero-knowledge sync layer, an existing store presence, and real users. What decides (b): docs/verelle.md names the Rust stack as an explicit goal, Cascade already proved one-Rust-core-many-shells for me, and consolidating three engine implementations into one is the architectural lesson Chart35 taught. The Chart35 designs (conformance corpus, zero-knowledge sync, provider-share filtering) carry over as designs, not code. OQ-1 revisits this if the career-plan conflict resolves toward "fold into Chart35."

**D3 - One Rust engine, pinned by a conformance corpus with a rule ledger.** The Marquette protocol rules live in exactly one place: the `verelle-core` crate, compiled natively for Android/iOS via UniFFI and to wasm for web. The rules are implemented only from the pinned source package acquired under G3 (protocol title, issuer, revision, effective date recorded per protocol - the Institute's public model page alone is descriptive and insufficient, verified 2026-07-18). Every implemented rule gets a ledger row: rule → pinned source location → test vectors, with boundary-case expected outputs derived independently by the reviewing instructor before seeing engine output, so the spec and its tests cannot share a single mistaken inference. Transitions capable of emitting "infertile" get a hazard analysis and a second independent check. The observation value type is a tagged enum carrying either categorical (Low/High/Peak) or quantitative (numeric E3G/LH) readings from day one, so Mira support is additive (FR-2, OQ-6).

**D4 - Storage: SQLite in the core on every client; PostgreSQL on the server.** Client store: rusqlite inside `verelle-store`, one schema for all platforms, derived from the Phase S specifications (op log and outbox shapes are lifecycle-spec outputs, not ad hoc). Server: PostgreSQL (product-doc direction) holding accounts, entitlements, and the encrypted operation log. Alternative considered: SQLite server-side (Chart35 does this) - rejected in favor of the doc's direction; Postgres also gives me streaming backups and the fleet's existing postgres_exporter.

**D5 - End-to-end encryption, zero-knowledge server, with the key lifecycle specified before any schema freezes.** Alternatives: (a) plaintext-on-server, enabling server-side computation; (b) client-side encryption, server stores ciphertext only. Chosen: (b), the Chart35 premise carried forward. Rationale: fertility data is the exact class of data that made Premom an FTC action and motivated WA MHMDA; a server that cannot read the data is the strongest control against breach, subpoena, and my own future temptation to add analytics. Consequence accepted: "server-side features" in the freemium tier are constrained to blind services - encrypted sync relay, encrypted backup, couple key exchange, entitlements. No server-side cycle computation, ever. The full key and membership lifecycle - device identity keys, account data key, Argon2id split derivation with a true auth/data separation (the server must never receive a password-equivalent reusable secret), per-device and per-member wrapping, key epochs, local-to-account import atomicity, password change, recovery-code custody, partner re-share, device loss/revocation, unlink semantics including queued old-epoch writes, and the future watch-enrollment path - is specified in Phase S, before the Phase 1 schema, and reviewed externally per OQ-9. Revision 1 deferred this to Phase 3, after real household data existed; that ordering was wrong and is fixed. A partner holding the couple key remains a recovery path - couple sharing doubles as backup.

**D6 - Web: Leptos, behind a time-boxed spike.** Alternatives: (a) TypeScript + wasm-bindgen around the Rust engine (larger ecosystem, my deepest platform); (b) Leptos (https://leptos.dev, active and stable in the 0.7+ line, verified 2026-07-18), where the engine links into the same wasm module with no JS binding layer. Chosen: (b), per the product doc's stated intent to try Leptos, **gated** by a 3-day spike (Phase 5): render a chart from engine output, run the crypto path in-browser, and hit the sync API. Spike fails → fall back to (a) without renegotiation. The fallback is pre-authorized here precisely so the spike cannot turn into a month.

**D7 - Server: Rust + Axum.** Product-doc direction. Alternatives noted for the record: Actix (heavier), reusing Chart35's Node/Express server (rejected under D2). Axum shares types with `verelle-core` via a common crate, which is the practical payoff of the all-Rust bet.

**D8 - Auth: email + password with Argon2id, opaque server sessions, couple linking by short-lived invite code.** Alternatives: OAuth social login (rejected: privacy posture and a third-party dependency for a privacy product), passkeys (deferred: additive later, not load-bearing now). The exact auth-secret derivation and its separation from the data key are Phase S outputs (D5). Account recovery is recovery-code or partner-re-share only; support cannot restore data and the UI says so at signup.

**D9 - Payments: Stripe on the web; the iOS purchase path is a gated decision.** Web: Stripe Checkout + Billing, settling to the Stephens Page LLC Mercury account (product-doc direction). Provisional pricing $4.99/mo or $39.99/yr, to be sanity-checked against Marquette NFP Pro and Read Your Body pricing at Phase 6. iOS: three lawful paths as of 2026 - (a) Apple IAP at 15% under the Small Business Program; (b) US external purchase links, now permitted but commissioned at 12%/27% with an attribution window after the 9th Circuit's 2025-12-11 modification of the Epic injunction (https://www.macrumors.com/2025/12/11/apple-app-store-fees-external-payment-links/, verified 2026-07-18); (c) no purchase surface in the app at all, subscribe on the web by your own initiative. At my scale (a) and (b) net out nearly identical and (a) is simpler UX. **Gated:** decide at Phase 6 as an ADR against the then-current guidelines (OQ-5). Android: Play Billing or web-subscribe, decided in the same ADR. Lapse and retention behavior per FR-12.

**D10 - Hosting and delivery: OpenTofu + Ansible onto a DigitalOcean droplet, GitHub Actions, Cloudflare DNS, Porkbun registrar.** Product-doc direction, and it is my existing fleet pattern. Recommendation within it: a dedicated 2 GB droplet (~$12/mo, inside NFR-8) from Phase 3 rather than colocating on the stephens.page droplet - not because the ciphertext is sensitive (D5 means it is not, much) but because a clean single-purpose host keeps the IaC honest and the blast radius of my 76-hostname shared droplet away from a health product. OQ-7 records the colocation question; observability reuses the existing fleet Prometheus/Grafana/Alertmanager stack either way.

**D11 - Sync: append-only encrypted operation log; the server never resolves conflicts.** Revision 1 described record-level last-write-wins with the HLC inside the ciphertext and idempotency on the record ID - semantics the server cannot execute (it cannot read the HLC) and that would reject legitimate edits (a logical record is edited many times). Revision 2 replaces that design. Every write is an immutable operation with a client-generated unique op_id (idempotency key); the logical record key (couple, date, marker type) travels inside the ciphertext; the server appends ops, assigns a monotonic sequence, and serves them through a transactional cursor - it stores and forwards, nothing more. Clients converge by applying a deterministic merge after decryption: highest HLC wins, device-ID tiebreak for identical HLCs; deletes are tombstone ops merged by the same rule; a new device bootstraps by full replay (at ~365 ops/user/year, replay is trivially cheap; no server compaction in v1). Accepted and documented privacy cost: the server sees op count, size, timing, key epoch, and deletion scopes - not content. The full state machine (queue drain, retry with response loss, process death between commit and enqueue, cursor restart, restore/replay, epoch changes mid-queue) is a Phase S specification with a model-based convergence suite as its acceptance test. Alternatives: CRDT libraries (more machinery than day-granular observations need), server-side LWW (impossible under E2EE, which is the point).

**D12 - Name, trademark, brand.** The product name is Verelle (verelle.app) and never contains "Marquette." Marquette University's Boland Institute runs its own trademarked app, Marquette NFP™ Pro (https://www.marquettenfppro.com/, verified 2026-07-18), so references to the method in marketing are nominative only ("supports the Marquette Method protocols as taught by certified instructors") and get reviewed under OQ-3 before public listing, alongside outreach to the Institute (OQ-3 also documents the IP basis of the rule transcription with counsel). Brand direction per the product doc: feminine, blue-leaning, adjacent to the Clearblue monitor aesthetic (reference image in docs/verelle.md) but distinct from it - and visually distinct from Marquette NFP Pro, which is both the incumbent and the trademark holder's own product.

**D13 - Push delivery and freshness.** APNs and FCM are named dependencies, not an afterthought: the server holds a push-token registry with token rotation and removal, sends opaque collapse-keyed "sync" pings, and records provider-response metrics. Foreground clients use an active path (short poll on foreground plus push-triggered fetch; a WebSocket upgrade is a Phase S option, not a commitment). Background clients get best-effort invalidation and sync-on-resume. Every chart surface renders a last-synced indicator so staleness is visible instead of silently misleading (NFR-3).

## 4. Architecture

### Components

| Component | Responsibility |
|---|---|
| `verelle-core` (Rust crate) | Domain types, Marquette protocol engine, cycle detection. No I/O. The only place protocol rules exist; every rule traced in the ledger. |
| `verelle-store` (Rust crate) | SQLite persistence, migrations (tested up and down), atomic observation+outbox commit, op queue. Schema derived from the Phase S specs. |
| `verelle-crypto` (Rust crate) | Argon2id derivation with auth/data separation, AES-256-GCM envelope (versioned), key epochs, couple-key wrap/unwrap. Implements the Phase S key lifecycle. |
| `verelle-sync` (Rust crate) | Client half of the op-log protocol; deterministic merge; queue drain; bootstrap replay. Implements the Phase S sync state machine. |
| `verelle-ffi` (Rust crate) | UniFFI interface over core+store+crypto+sync for Kotlin and Swift (UniFFI is production-proven in Firefox mobile, pre-1.0 - https://github.com/mozilla/uniffi-rs, verified 2026-07-18). |
| `verelle-server` (Rust/Axum) | Accounts, sessions, couple linking, entitlements, append-only encrypted op log, deletion manifest, push relay (APNs/FCM token registry, opaque pings), Stripe webhooks. Shares types with core via a common crate. |
| `verelle-web` (Leptos, gated D6) | Web client; engine and crypto compiled to wasm in-module. |
| `apps/android`, `apps/ios` | Native shells: UI, notifications, platform keystore, store packaging. Watches post-1.0. |
| `corpus/` | Golden vectors plus the rule ledger: rule → pinned source → vectors, boundary cases independently derived by the instructor, run in CI. |
| `docs/specs/` | The Phase S lifecycle specifications (sync state machine, key/membership lifecycle, deletion/retention model) and their shared invariant matrix, versioned; schema PRs must cite them. |
| `infra/` | OpenTofu (droplet, DNS, firewall) + Ansible (hardening, Postgres, deploy) + GitHub Actions pipelines. |

### Data model (core entities)

- **Account** (email, auth verifier per the Phase S derivation, created_at) and **Device** (per-install identity, sync cursor, push token).
- **Couple** - exactly two accounts, wrapped shared data key per member per epoch, link/unlink audit trail with epoch history.
- **Observation** (client-side) - the atom: (date, marker type, value enum: categorical monitor reading | quantitative reading | LH strip | bleeding | intercourse | mucus | temperature | note, recorded_by, HLC timestamp). Materialized client-side by merging the op log; grows ~365 ops/user/year - unbounded growth is not a concern at this scale.
- **Cycle** - derived by the engine from bleeding observations; materialized client-side only. The server never sees cycles because it never sees plaintext.
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

Fertility data post-Dobbs is the motivating threat, so this section is material. The server-visible surface is: email addresses, auth verifiers, Stripe billing linkage, couple graph, push tokens, op timing/size/epoch metadata, deletion scopes, and ciphertext. What the server cannot produce, for anyone: readings, cycles, status, notes. Account existence and all of the metadata above are themselves treated as consumer health data in the §6 inventory and privacy policy, because a Verelle account is health-revealing on its own.

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
- **Clearblue supply failure** (A-3): data model already accepts quantitative monitors (D3); protocol addition is v1.1 scope, not a schema migration. OQ-6 watches this.
- **Apple/Google policy shifts on external payments**: D9 decides at Phase 6 against then-current rules, not today's.
- **Cloudflare/Porkbun/Let's Encrypt**: standard, low-touch; DNS is IaC'd; none hold health data.

Concurrency and time: convergence is a client-side deterministic function of the decrypted op set (D11) - HLC then device-ID, tombstones merged by the same rule - so any two clients holding the same ops render the same chart, regardless of arrival order. Idempotent push (op_id) makes retry safe; the convergence suite (§6) is the proof, covering concurrent edit/edit, edit/delete, response-loss retries, clock skew, process death, cursor restart, restore/replay, and three-device histories. All observation dates are civil dates in the user's recording timezone (fertility observations are day-granular; a timezone shift never re-buckets an existing observation).

## 5. Delivery phases

Estimates are in effort-weeks (1 ew ≈ 8 focused hours) with confidence marked; at my realistic 5-10 h/week, calendar time is 1-2× the effort number, plus external latencies (counsel, instructor, FDA if 513(g) is used). Phases 0+R+S+1+2+3 total roughly 20-31 ew ≈ 7-14 months of calendar. Greenfield system, no live migration anywhere; the irreversible steps are called out in Phase 7. **Blocked markers are normative: a blocked phase does not start until its gate closes.**

**Phase 0 - Bootstrap.** Cargo workspace, crate skeletons, CI (fmt/clippy/test/corpus runner), ADR directory, `docs/specs/` skeleton, corpus format decided. Deliverable: green pipeline on a hello-world engine test. Gate: CI runs the (empty) corpus on every push. 1-2 ew, high confidence. *Not blocked - scaffolding is planning-adjacent and survives any gate outcome.*

**Phase R - Viability: regulatory disposition and protocol sources.** No product code. (1) Close OQ-1 with a written decision (gate G1). (2) Write the intended-use memo: exact claims, indications, output semantics, avoid/achieve workflows. (3) Engage FDA-device counsel; obtain written advice; record the D1 disposition - non-device basis, funded regulatory plan, or re-scope to record-and-display (gate G2; 513(g) as the escalation path if counsel wants a formal FDA view). (4) Acquire the complete current authoritative protocol materials for regular cycles and postpartum via the couple's instructor and Boland Institute outreach; pin title/issuer/revision/effective date per protocol; confirm instructor availability for independent vector derivation (gate G3). (5) Obtain privacy-counsel parameters for the deletion/retention model (OQ-10). Deliverables: the memo, counsel letters, the pinned source package, a written stop/re-scope record. 1-2 ew internal, high confidence on effort - external latency dominates (weeks for counsel; months if 513(g) is filed, which blocks only distribution, not household shadow work). Costs from C-5. Depends on: nothing but scheduling; runs in parallel with Phase 0.

**Phase S - Lifecycle specifications.** Three cross-referenced specs plus one shared invariant matrix in `docs/specs/`, written before any schema freezes: (a) **sync state machine** - op log, cursor transactionality, queue drain, retry/response-loss, process-death points, bootstrap replay, epoch changes mid-queue (D11); (b) **key and membership lifecycle** - everything listed in D5, including local-to-account import atomicity, unlink epoch semantics with queued old-epoch writes, recovery, device revocation, and the watch-enrollment path (FR-13); (c) **data inventory and deletion/retention model** - every server-visible datum mapped to subject(s) and retention (including push tokens and metadata), the four FR-11 deletion operations with couple-data ownership rules, manifest mechanics, processor flow-down list (DigitalOcean, Stripe, Apple, Google), informed by OQ-10 parameters. External review: the key lifecycle is reviewed per OQ-9 (a qualified applied-crypto reviewer, or verbatim adoption of a published audited scheme with documented deviations). Acceptance gate: invariant matrix signed off; every later schema PR cites the spec section it implements. 3-5 ew, medium confidence. Depends on: Phase 0; drafts may start before Phase R completes, but (c) finalizes only after OQ-10 parameters arrive.

**Phase 1 - Engine + corpus (retires the correctness risk).** **Blocked by G1, G3, and the counsel-consult step of G2 (written advice received).** Transcribe the pinned protocol sources into a versioned spec; implement regular-cycles and postpartum (order per OQ-2) in `verelle-core`; build the rule ledger; have the instructor independently derive expected outputs for boundary vectors (learning-phase, missed readings, back-to-back Peaks, cycle-start edges, postpartum transitions) before seeing engine output; hazard analysis plus second check on every infertile-emitting transition; conservative defaults per FR-5; property tests around cycle detection; `verelle-store` schema per Phase S; a CLI harness that replays a vector file and prints the chart. Delivers: FR-2, FR-3, FR-4, FR-5, FR-6 (engine level), NFR-7. Acceptance gate: corpus 100% green in CI; ledger complete (every rule row has a pinned source and at least one vector); instructor signs the versioned spec and boundary corpus. 5-7 ew, medium confidence. Depends on: Phases 0, R, S.

**Phase 2 - Walking skeleton on the first phone (retires the architecture risk).** **Blocked by G1.** UniFFI bindings; native shell on the founding couple's primary platform (default Android per my Compose depth - OQ-2 can flip this): record screen, today's status, basic cycle chart, monitor-window reminder, local CSV/JSON export. Local-only, no accounts - but crash-safe from the start: atomic observation+outbox commits, schema migrations tested up and down, storage-exhaustion behavior defined, export working before any real data is entrusted. Delivers: FR-2/3/4/5 (UI), FR-9 (basic), FR-10, FR-11 (export half), NFR-1 (local), NFR-5. Acceptance gate: a founding-couple member records a real day on a real phone (shadow mode); cold start < 2 s measured; UniFFI round-trip suite passes; crash-injection at the commit points loses nothing. 4-6 ew, medium confidence.

**Phase 3 - Server, accounts, E2EE sync, couple sharing (household MVP, still shadow mode until Phase 1's sign-off and G2 close).** Implementation of the Phase S specs - the design work is already done and reviewed; this phase builds to spec. Axum server; accounts and sessions per the key lifecycle; couple invite/link/unlink with epoch rotation; append-only op log with transactional cursor; push relay with token registry (D13); freshness indicators; entitlement model present but everything free-tier while unlaunched; OpenTofu + Ansible deploy (OQ-7 decided here as an ADR); TLS; nightly encrypted backups off-droplet with the deletion manifest wired in; **restore drill executed including manifest reapplication**; fleet Prometheus/Grafana targets added. Delivers: FR-1, FR-7, FR-8, FR-11 (deletion operations), NFR-2, NFR-3, NFR-4 (measured), NFR-6, NFR-8, NFR-10. Acceptance gate: (a) two real phones, two accounts, one couple: observation recorded offline on one renders on the other's foregrounded app ≤ 10 s after reconnect at p95; (b) the model-based convergence suite is green - concurrent edit/edit, edit/delete, retries with response loss, clock skew, process death between commit and enqueue, cursor restart, restore/replay, three-device histories; (c) key-lifecycle adversarial tests pass - unlink-dark with an offline remaining device, with a restored backup, and against a replaying server; password change and recovery-code paths lose nothing; (d) deletion E2E: delete, then restore the oldest backup, prove the manifest prevents resurrection; (e) k6 meets NFR-4. 6-9 ew, low-medium confidence - this is the phase the Phase S specs exist to de-risk. Depends on: Phases 1, 2, S. *M1 measurement (shadow mode) starts at this gate.*

**Phase 4 - Second phone platform.** **Blocked by G1.** SwiftUI shell (or Compose, if OQ-2 flipped Phase 2) to feature parity with Phase 2 + sync. Delivers: platform parity for FR-1..11. Gate: both founding-couple phones in daily shadow use. 4-6 ew, medium confidence (Chart35 gave me working SwiftUI). Depends on: Phase 3. *If the household is single-platform, Phase 4 swaps order with Phase 5 freely.*

**Phase 5 - Web app.** **Blocked by G1.** The D6 Leptos spike (3 days, hard-boxed) → build: sign-in, chart view, record, export, account management. Delivers: web parity for FR-1..11; resolves OQ-8. Gate: spike verdict ADR'd; crypto interop verified against a phone-written account; same-engine parity is structural. 1 ew spike + 4-6 ew build, low confidence (Leptos is new ground - that is partly the point). Depends on: Phase 3; parallelizable with Phase 4.

**Phase 6 - Payments.** **Blocked by G1; public activation additionally blocked by G2.** Stripe Checkout/Billing + webhooks + entitlement enforcement + grace period + the FR-12 lapse/retention schedule with warning emails; pricing checked against comparables; the OQ-5 mobile-purchase ADR against then-current App Store/Play rules; free-tier boundaries enforced (local use stays fully free). Delivers: FR-12. Gate: test-mode lifecycle exercised end to end - purchase → unlock → lapse → grace → pause → warnings → simulated 12-month deletion; refund path documented. 3-4 ew, medium confidence. Depends on: Phase 3 (server), any client.

**Phase 7 - Public launch.** **Blocked by G2 fully closed (and everything upstream).** MHMDA-conformant consumer-health privacy policy built on the Phase S data inventory; OQ-3 (trademark/nominative copy + Institute outreach) closed; incident-response and breach-notification runbook counsel-reviewed, with one tabletop (stolen server/backup credentials) run and corrective actions closed **before the closed beta begins**; store health-data declarations (Play Health Apps declaration + Data Safety form, Apple privacy nutrition labels) consistent with the privacy policy; store listings (US storefronts); closed beta (10-20 couples from the Marquette community); crash-free and NFR re-verification; then public release on App Store, Play, and web (product-doc distribution). 3-5 ew, medium confidence. **Reversible/irreversible:** everything before store submission is reversible. Submitting under the Verelle name/bundle IDs and taking the first external subscription are the points of no return (names and IDs are permanent; money creates obligations). Abort criteria before that point: any launch criterion in §6 unmet → do not submit. After it: recovery is standard ops (refunds via Stripe, incidents per the runbook), not rollback. Post-external-users, all schema changes are additive-only with a pre-deploy backup.

**Phase 8 - Watches (post-1.0).** Wear OS tile/complication + watchOS: today's status, quick-record, enrolled per the watch path the Phase S key lifecycle already names. Delivers: FR-13. Gate: quick-record round-trips through sync from each watch. 5-8 ew, low confidence. Deliberately last: highest platform cost per user-value until the phone product proves M2.

## 6. Validation and operations

### Test levels and named scenarios

- **Conformance corpus + rule ledger** (the load-bearing suite): golden vectors per protocol scenario, boundary cases independently derived by the instructor, every engine rule traced to a pinned source; run on every commit (NFR-7). Hazard analysis with a second independent check on every infertile-emitting transition.
- **Property tests**: cycle detection invariants (a bleeding-start always opens a cycle; status is a total function over any observation sequence; no panic on any input ordering; ambiguity never yields silent infertile).
- **Crypto and key-lifecycle tests**: envelope round-trip across Rust-native and wasm builds; wrong-key and wrong-epoch failure modes; version-envelope forward-compat; adversarial suite from the Phase S invariant matrix - unlink-dark (offline remaining device, offline departed device, restored backup, replaying/compromised server), password change, recovery code, local-to-account import atomicity under crash injection.
- **Sync convergence suite** (model-based, from the Phase S state machine): concurrent edit/edit, edit/delete, retries before and after response loss, clock skew, process death between local commit and enqueue, cursor restart, restore/replay, three-device histories. Acceptance is convergence plus zero loss of acknowledged writes (NFR-1), not merely "an LWW conflict was exercised."
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
| FR-2 | 1, 2 | Corpus vectors (values incl. quantitative variant); record-screen E2E |
| FR-3 | 1, 2 | Corpus vectors; record-screen E2E |
| FR-4 | 1 | Property tests + corpus cycle-boundary vectors |
| FR-5 | 1 | Corpus 100% green + complete rule ledger + instructor sign-off |
| FR-6 | R, 1 | Pinned postpartum source (G3) + postpartum corpus vectors + instructor review |
| FR-7 | S, 3 | Key-lifecycle spec + adversarial unlink-dark tests + two-phone gate |
| FR-8 | S, 3 | Sync state machine spec + convergence suite + offline E2E |
| FR-9 | 2, 5 | Instructor reads a rendered chart in follow-up (M1 activity) |
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
| NFR-7 | R, 1 | Pinned sources (G3); corpus + ledger in CI, blocking; independent vector derivation documented |
| NFR-8 | 3 | DO invoice ≤ $20/mo, checked monthly |
| NFR-9 | 2-7 | Dependency review in each release checklist; no analytics SDK in lockfiles; push payloads inspected in E2E |
| NFR-10 | S, 3 | Deletion model spec; drill proves live + backup deletion within bounds; processor flow-down list on file |
| G1 | R | Written OQ-1 decision on file |
| G2 | R, 7 | Counsel written advice on file (Phase 1 entry); disposition fully closed (Phase 7 entry) |
| G3 | R | Pinned source package + instructor engagement confirmed |

### Observability

Reuse the existing fleet stack (Prometheus/Grafana/Alertmanager, already alerting via email + Twilio SMS): node exporter and postgres_exporter on the Verelle droplet, blackbox probe of `/healthz`, a backup-freshness metric (alert if the newest off-droplet backup is > 26 h old), a deletion-manifest job metric, Axum request metrics (rate/errors/duration), push-provider response metrics (token failures, throttling). Logs: `tracing` JSON to journald, request metadata only - never bodies, never plaintext health data (structurally absent anyway), emails scrubbed to account IDs, 30-day retention. Client crash reporting: store-native only (Play Console, App Store Connect) - no third-party SDK, per NFR-9. Paging: me, via the existing Alertmanager routes.

### Incident response (operational control for C-4 / HBNR)

A written incident-response and breach-notification runbook, counsel-reviewed before the Phase 7 closed beta: incident classification (metadata exposure vs key compromise vs client-build compromise), containment and credential/key rotation steps, evidence preservation that adds no sensitive content to logs, the notification decision tree mapping user / FTC / state / processor notices to their deadlines with message templates, processor contacts (DigitalOcean, Stripe, Apple, Google), counsel escalation contact, and a named backup human contact. Targets recorded in the runbook: detection-to-triage ≤ 24 h, triage-to-counsel ≤ 72 h for any suspected covered breach. One tabletop (stolen server/backup credentials) runs pre-beta with corrective actions closed; the malicious-release scenario is documented in the runbook.

### Launch criteria (Phase 7 ship/no-ship, distinct from M1-M3)

1. Corpus 100% green, rule ledger complete, instructor sign-off recorded (NFR-7 / FR-5).
2. Gate G2 fully closed with a written disposition permitting the shipped feature set (D1).
3. Restore + deletion drill passed within the last quarter, manifest reapplication included (NFR-6, NFR-10).
4. MHMDA-conformant privacy policy published from the Phase S data inventory; in-app deletion verified (FR-11, C-4).
5. OQ-3 closed with written outcomes (trademark copy + Institute outreach).
6. Incident-response runbook counsel-reviewed; tabletop completed, corrective actions closed.
7. Store health-data declarations submitted and consistent with the privacy policy (Play Health Apps + Data Safety; Apple privacy labels).
8. Closed-beta crash-free sessions ≥ 99.5% over the final two beta weeks.
9. k6 NFR-4 run passed on the production droplet size.

### Post-launch review and operations

M1 is read at Phase 3 + 3 months (continue/iterate/stop on public investment); M2 at launch + 3 months and M3 at payments + 6 months (together they decide whether Verelle is a product or an apostolate that breaks even). I am the owner and the only operator: backups nightly (verified by the freshness alert), retention jobs (lapse schedule, log expiry, token cleanup) monitored, dependency updates via a monthly Renovate batch, store-compliance sweeps each Apple/Google policy season, quarterly restore + deletion drills. The local-first design is also the succession plan: if the operator disappears, installed apps keep working and export keeps working; that promise goes in the public docs.

## 7. Risks and pre-mortem

Six months in, Verelle failed. The most plausible stories, with the plan's answer:

1. **Scope ate the solo developer.** Five client surfaces, a novel crypto design, payments, and now two specification phases, at 5-10 h/week. *Answer:* MVP is Phase 3 on the household's own phones; watches are post-1.0 by plan; each phase has a hard gate so a stall leaves a working smaller product, not rubble. Early-warning signal: a phase exceeding 2× its effort estimate → cut surface (web or second platform waits), do not stretch.
2. **The career-plan collision.** Decision 4's "no new side projects ship for 12 months" was written 2026-06-10 for good reasons; Verelle either violates it or dies half-built as the 31st app. *Answer:* G1 forces the choice explicitly before Phase 1 - ship-after-window, amend-the-plan, or fold-into-Chart35 - instead of drifting into the exact failure the rule exists to prevent. Phases 0/R/S are the only work permitted meanwhile, and all three survive any G1 outcome.
3. **The regulatory gate gets shortcut.** Counsel is slow or expensive, enthusiasm is high, and "everyone else ships without clearance" starts sounding like analysis. *Answer:* G2 is written into the phase entry conditions and launch criteria, with the three dispositions and stop/re-scope criteria recorded in Phase R before any code exists to be sunk-cost about. Early-warning signal: any argument for skipping counsel that cites a competitor.
4. **A wrong "infertile" day.** The engine mislabels a fertile day; a couple conceives against their intention; trust (and possibly more) is lost. *Answer:* pinned authoritative sources (G3), the rule ledger, instructor-independent boundary vectors, hazard analysis on every infertile-emitting transition, conservative defaults, and shadow mode until sign-off. Residual risk is real and named: no charting app can make a method's failure rate zero.
5. **Silent write loss breaks the founding promise.** Two offline edits to the same day, a retry after a lost response, a tombstone racing an edit - and an acknowledged observation quietly vanishes, discovered only after the chart influenced a decision. *Answer:* the append-only op log with client-side deterministic merge (D11) makes convergence a pure function, and the model-based convergence suite is a Phase 3 acceptance gate, not an aspiration. Early-warning signal: any manual data repair during household use is treated as a sev-1 against NFR-1.
6. **A privacy or security incident outruns the operator.** Not necessarily a breach - a stolen credential, a bad restore that resurrects deleted data, an SDK that crept in. *Answer:* NFR-9 checked per release; the deletion manifest survives restores by construction; the counsel-reviewed IR runbook with deadlines and a tabletop exists before any external user does; D5 keeps the worst case structurally small.

## 8. Open questions and gates

### Gates (these carry the readiness verdict)

| Gate | What closes it | Owner | Blocks | Rejection criterion |
|---|---|---|---|---|
| **G1** | A written OQ-1 decision reconciling Verelle with career-plan Decision 4: ship after the 12-month window, amend the career plan deliberately outside a working session, or fold Marquette support into the Chart35 estate | Jacob | Phases 1-8 (Phases 0/R/S exempt) | Decision is "not this year" → shelve cleanly; Phases 0/R/S artifacts keep their value |
| **G2** | FDA-device counsel's written advice on the intended-use memo, and a recorded D1 disposition: (a) non-device basis, (b) funded regulatory plan, or (c) re-scope to record-and-display. 513(g) escalation if counsel advises it | Jacob + counsel | Counsel-consult step blocks Phase 1 status-computation coding; full closure blocks any external user, marketing claims, Phase 6 public activation, and Phase 7 | Disposition (b) is unaffordable and (c) is unacceptable → stop; disposition (c) → remove computed status from the shipped product and re-plan FR-5 |
| **G3** | The pinned authoritative protocol source package (title, issuer, revision, effective date, per protocol) plus a credentialed instructor committed to independent vector derivation | Jacob + instructor | Phase 1 | Current materials or instructor cannot be secured → computed-status feature stops; record-and-display may proceed |

### Open questions

| ID | Question | Owner | Resolution gate | Blocks |
|---|---|---|---|---|
| OQ-1 | The G1 career-plan reconciliation (see gates table) | Jacob | Written decision in Phase R | Phases 1+ |
| OQ-2 | Founding couple's facts: which phones (orders Phases 2/4), which watch platforms (scopes Phase 8), which protocol applies at their first real use (orders Phase 1), and what current protocol materials their instruction provides (feeds G3) | Jacob | 15-minute household conversation, answers recorded in this doc | Phase 1 protocol priority; Phase 2 platform |
| OQ-3 | Nominative use of "Marquette Method" in listings and marketing given Marquette NFP™ Pro; Boland Institute outreach; documented IP basis for the rule transcription | Jacob (+ 1 hr legal consult) | Reviewed copy checklist + outreach record | Phase 7 store submission |
| OQ-4 | The G2 regulatory disposition (see gates table); supersedes revision 1's Phase 7 placement | Jacob + counsel | Phase R counsel engagement | Phase 1 status coding; Phase 7 |
| OQ-5 | iOS/Android purchase path: IAP at 15%, US external links at 12%+, or web-only subscribe - against the rules in force at Phase 6 | Jacob | ADR at Phase 6 open | Phase 6 mobile purchase UX |
| OQ-6 | Mira and Clearblue-supply watch: when does quantitative-protocol support (v1.1 candidate) become necessary rather than optional? | Jacob | Ask the instructor at the Phase 1 review; recheck availability each quarter | v1.1 scope only (schema already ready per D3) |
| OQ-7 | Dedicated droplet vs colocation on the stephens.page host (D10 recommends dedicated from Phase 3) | Jacob | Infra ADR at Phase 3 start | Phase 3 deploy target |
| OQ-8 | Leptos or the TypeScript fallback for web | Jacob | The D6 spike verdict, 3 days, ADR'd | Phase 5 build |
| OQ-9 | Key-lifecycle external review path: a qualified applied-crypto reviewer (budget from C-5), or verbatim adoption of a published audited scheme with documented deviations | Jacob | Reviewer engaged or scheme adopted, recorded in the Phase S spec | Phase S sign-off |
| OQ-10 | Privacy-law parameters for the deletion/retention model: live-system deletion deadline, treatment of couple-shared data subjects, HBNR applicability mapping per data flow | Jacob + privacy counsel | Counsel parameters memo in Phase R | Phase S deletion-model finalization; Phase 7 |

What I do not yet know, and say so: whether counsel will let computed fertility status ship at all (G2 is the hardest technical-adjacent question, and the plan now refuses to spend the year before asking it), whether the authoritative protocol package can be obtained on terms that support a public product (G3), whether the Marquette community wants a second app (M2 is the test, not my intuition), and whether this project should exist this year at all (G1 - still the hardest question in the document, and still deliberately unanswered by me alone).

---

## Verification matrix

| Requirement, finding, or gate | Revised-plan step | Verification |
|---|---|---|
| Rust shared core (docs/verelle.md) | D2/D3; `verelle-core` in §4 | Phase 2 gate: UniFFI round-trip suite passes against the single core |
| Rust + Axum server (docs/verelle.md) | D7; `verelle-server` in §4 | Phase 3 gate: deployed Axum server passes two-phone E2E + k6 NFR-4 threshold |
| PostgreSQL (docs/verelle.md) | D4; EncryptedOp store | Phase 3 gate: restore drill executes against Postgres with postgres_exporter metrics live |
| UniFFI Kotlin/Swift shells (docs/verelle.md) | D2; `verelle-ffi`; Phases 2 and 4 | Phase 2/4 gates: shells at parity, UniFFI suite green on both platforms |
| Leptos-or-TypeScript web (docs/verelle.md) | D6; Phase 5; OQ-8 | Phase 5 spike ADR recorded within the 3-day box; chosen path ships parity gate |
| Account on web / Android + Wear OS / iOS + watchOS (docs/verelle.md) | Phases 2-5 and 8; FR-1, FR-13 | Per-phase parity gates; Phase 8 watch quick-record round-trip test |
| verelle.app + GitOps stack: GH Actions, OpenTofu, Ansible, DO, Cloudflare, Porkbun (docs/verelle.md) | D10; `infra/` | Phase 3 gate: rebuild path (`tofu apply` + Ansible + restore) exercised in the drill |
| Stripe → Mercury freemium (docs/verelle.md) | D9; FR-12; Phase 6 | Phase 6 gate: full Stripe test-mode lifecycle incl. lapse/retention schedule |
| Distribution: App Store, Play, website (docs/verelle.md) | Phase 7 | Launch criteria 1-9 all checked, incl. store health declarations (criterion 7) |
| Feminine, blue-leaning, Clearblue-adjacent style (docs/verelle.md) | D12 | Phase 2/5 design check against the docs/verelle.md reference image; distinctness from Marquette NFP Pro noted in the OQ-3 checklist |
| B1 (regulatory gate too late) | Phase R; D1; gate G2; M1 shadow-mode | G2 written advice on file before Phase 1 status coding; launch criterion 2 blocks Phase 7 until disposition fully closed |
| B2 (no authoritative rule source) | Phase R source acquisition; gate G3; Phase 1 ledger + independent vectors + hazard analysis | G3 pinned-source package on file; ledger complete (every rule row has pinned source + ≥1 vector); instructor signature on versioned spec and boundary corpus (Phase 1 gate; NFR-7) |
| B3 (sync semantics contradictory) | D11 rewrite; Phase S sync state machine; Phase 3 convergence suite | Convergence suite green on all named scenarios; NFR-1 acceptance = zero acknowledged-write loss |
| B4 (key lifecycle after data commitment) | Phase S key/membership spec + invariant matrix; OQ-9 review; Phase 2 hardening | Invariant matrix signed pre-Phase-1-schema; adversarial tests (unlink-dark offline/backup/replay, crash-injected import, password change, recovery) pass in Phase 3 gate |
| B5 (deletion undefined for backups/shared data) | Phase S deletion model; FR-11; NFR-10; DeletionManifest; retention table | Phase 3 deletion E2E: delete → restore oldest backup → manifest prevents resurrection; quarterly drill; OQ-10 counsel parameters on file |
| B6 (freshness SLO unkeepable; push infra missing) | NFR-3 split; D13; push relay in §4 | Phase 3 gate: foreground p95 ≤ 10 s measured; push state-matrix tests pass; freshness indicator present on every chart surface |
| B7 (no incident-response control) | §6 incident-response section; Phase 7 launch criterion 6 | Counsel-reviewed runbook on file; pre-beta tabletop completed with corrective actions closed |
| NEW1 (subscription-lapse lifecycle) | FR-12 lapse definition; §4 retention table; Phase 6 | Phase 6 gate: simulated-clock lapse E2E through pause, warnings, and 12-month deletion |
| NEW2 (store health declarations) | Phase 7 launch criterion 7 | Play Health Apps declaration + Data Safety form + Apple privacy labels submitted, cross-checked against the privacy policy in the Phase 7 checklist |
| NEW3 (watch enrollment in key lifecycle) | FR-13; Phase S key spec requirement | Phase S spec names the watch path; Phase 8 design review confirms no epoch redesign was needed |
| Gate G1 | Phase R item 1; §8 gates table | Written OQ-1 decision on file before any Phase 1 commit |
| Gate G2 | Phase R items 2-3; D1; launch criterion 2 | Counsel written advice (Phase 1 entry) and recorded disposition (Phase 7 entry) on file |
| Gate G3 | Phase R item 4; NFR-7; FR-5/FR-6 | Pinned source package + instructor commitment recorded; Phase 1 may not start without them |

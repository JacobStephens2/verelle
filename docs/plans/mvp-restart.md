# MVP restart — where things are

Signpost only. The decisions live in ADRs and in the spec; this file exists so
that a reader who opens `docs/plans/` finds the current work instead of the
retired plan.

## Current

- **Spec: [#6](https://github.com/JacobStephens2/verelle/issues/6)** — the MVP
  in full: users, user stories, implementation and testing decisions, scope, and
  the risks being carried. Implementation is complete: all ten sub-issues are
  closed, including the physical-phone airplane-mode gate.
- **`CONTEXT.md`** — the domain glossary. Every term in the spec and the tickets
  means what that file says it means.
- **ADRs 0009–0014** — fork Chart35 with Vue and Capacitor (0009), bundle native
  assets and never set `server.url` (0010), transcription is not a verdict
  (0011), Evolu for storage, sync and E2EE (0012), owner secrets in the platform
  keystore (0013), validation moves to handover (0014).
- **`prototype/evolu-capacitor/VERDICT.md`** (branch `prototype/evolu-capacitor`)
  — the evidence ADR 0012 rests on, including the two configuration requirements
  that are load-bearing and look like dead code.

## Next

The next work is human validation at handover, not another implementation
phase. ADR 0014 defines the sequence:

1. Build the current `main` branch and install it on both Wilson phones.
2. Ask what stopped them using the other apps, and whether they want a
   record-and-display app or expect it to interpret their Chart.
3. Pair the phones in person, then retro-enter one of Mrs. Wilson's completed
   paper Cycles and have her confirm that Verelle renders it correctly.
4. Record discrepancies and requested corrections as new issues. Rework after
   first use is expected, not a failure of the MVP.
5. After the past Cycle is confirmed, chart one live Cycle in parallel with
   paper.

There is no active post-MVP feature roadmap. Any next build should come from
handover evidence rather than from the retired plan below.

## Retired

`docs/plans/verelle-plan.md` is **superseded for scope, stack, and sequencing**
and must not be built from — it describes a Rust core behind Kotlin, SwiftUI and
Leptos shells with an Axum server over PostgreSQL, all retired to the
`v1-archive` tag by ADR 0009. Its success metrics are withdrawn or out of scope:
M1 by ADR 0014, M2 and M3 because the MVP has two users.

`docs/plans/verelle-sync-integration-plan.md` and `docs/launch/` describe that
same retired implementation. They remain only as historical records; their
phases, gates, account model, billing plan, store copy, and release checklists
are not current work and must not be resumed without a new decision and plan.

Three things in it still hold and are not reproduced anywhere else: the
**Marquette Method** reference (alongside
`docs/marquette-method-business-logic-specification-for-verelle.md`), the
**threat model**, and the **regulatory reasoning** for the record-and-display
boundary — the 21st Century Cures Act exclusion, and 21 CFR 884.5370 / product
code PYT (Natural Cycles, De Novo DEN170052) as the Class II precedent computed
fertility guidance is evaluated against. ADR 0001 and ADR 0011 are the operative
statements of that boundary.

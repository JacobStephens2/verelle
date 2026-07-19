# ADR 0004: retain Leptos CSR after the browser spike

- Status: accepted for the client surface; full Phase 5 gate remains open
- Date: 2026-07-19
- Source: plan D6 and Phase 5

## Decision

Continue with Leptos using client-side rendering (CSR) and Trunk. The current
stable line, Leptos 0.8, links `verelle-core` and `verelle-crypto` into the same
WebAssembly module. This keeps chart behavior in the shared Rust core without a
second TypeScript domain model and fits the separately deployed Axum API.

The spike passed the portions that are safe at this stage:

- a release browser bundle rendered the regular fixture through
  `verelle-core`;
- an AES-256-GCM seal/open round trip ran inside the WebAssembly module;
- the interactive record-and-chart surface persisted synthetic facts across a
  browser reload;
- the native helper test, wasm check, release Trunk build, and headless-Chrome
  smoke test passed.

The bundle produced during the decision was approximately 623 KiB of WebAssembly
before transport compression. That is acceptable for the authenticated app
surface, where search indexing is irrelevant. Initial-load performance remains
a release measurement.

## Boundaries

This decision does not close the full D6/Phase 5 gate. The required sync-API
interop test cannot honestly run while ADR 0003 and OQ-9 prohibit production
authentication and the server exposes no sync route. That test remains pending;
its absence is not replaced with an unauthenticated temporary endpoint.

The preview stores only synthetic plaintext observations in browser
`localStorage`. Real-data use requires a reviewed encrypted browser persistence
design, export/recovery, and the remaining privacy gates. The UI names this
limitation prominently.

## Consequences

- TypeScript remains the pre-authorized fallback if later browser persistence,
  accessibility, ecosystem, or sync interop work makes Leptos fail the full
  gate.
- The workspace minimum Rust version rises from 1.85 to 1.88, matching the
  current stable Leptos 0.8 requirement.
- The web app stays CSR rather than Leptos SSR; the privacy-sensitive app has no
  SEO requirement, and a separate API keeps the server trust boundary explicit.

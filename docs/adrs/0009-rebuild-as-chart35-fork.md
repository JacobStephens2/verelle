# ADR 0009: rebuild Verelle as a Capacitor/Vue fork of Chart35

- Status: accepted; view-layer clause amended by ADR 0015
- Date: 2026-08-25
- Supersedes: ADR 0004 (retain Leptos CSR after the browser spike) and
  ADR 0004 (Android is the first phone platform) — the repo has two 0004s
- Note: drafted as 0006 during the 2026-08-25 design session; renumbered to
  avoid colliding with ADR 0006 (Stripe on web)

## Decision

Verelle is rebuilt as a fork of the Chart35 codebase — TypeScript, Vite, and
Capacitor shells for iOS and Android — with Vue 3.5+ as the view layer. The Rust
workspace (`verelle-core`, `-crypto`, `-sync`, `-store`, `-ffi`, `-cli`,
`-server`, `-web`, `-auth`, `-api`), the Leptos CSR client, the two Android
trees, and the iOS and watch surfaces are retired to the `v1-archive` tag.

## Context

The v1 stack reached ten crates and five client surfaces without ever reaching a
working production login. The cause was not the UI: the Axum backend was down for
weeks behind health checks that returned HTTP 200 with the web shell, deployed by
an Ansible playbook that never installed the binary, under two contradictory
systemd units. Two of the four candidate startup failures existed only because of
OPAQUE and the OQ-9 review apparatus.

Chart35 already solves the parts that failed: it ships to both app stores from
one TypeScript codebase on paid developer accounts, has working E2E-encrypted
sync where the server holds only ciphertext, and deploys from CI.

## Considered options

Keeping `verelle-core` and replacing only the clients was rejected: its chart
rules are a few hundred lines, worth porting but not worth keeping a Rust
workspace and UniFFI toolchain alive for. Fixing the v1 login and restyling was
rejected because it addresses the symptom, not the operational surface.
Cross-platform native (Expo, Flutter, KMP) was rejected because it discards
WebCrypto, IndexedDB, CSS design tokens, and an approved two-store pipeline,
and makes a data-dense 35-column grid harder rather than easier.

## Consequences

Verelle and Chart35 duplicate date utilities, sync, crypto, and design tokens.
Extracting a shared `packages/chart-core` is correct but deferred until the app
is in real use — the seam exists (`packages/contracts` is already a workspace
package). The two apps do not share a view layer and never will; Chart35 is
vanilla imperative DOM and Verelle is Vue.

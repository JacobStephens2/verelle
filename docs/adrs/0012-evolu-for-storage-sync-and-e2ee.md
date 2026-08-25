# ADR 0012: Evolu provides storage, sync, and end-to-end encryption

- Status: accepted
- Date: 2026-08-25
- Evidence: `prototype/evolu-capacitor/VERDICT.md` (branch `prototype/evolu-capacitor`, commit `90b4fdf`)

## Decision

Verelle stores observations in Evolu and syncs them between the couple's two
phones through an Evolu relay. Evolu owns local persistence (SQLite-WASM with
SQLite3MultipleCiphers on the OPFS SAH-Pool VFS), the merge (per-column
last-write-wins over hybrid logical clocks), and the encryption. Dexie is not
used. No CRDT, clock, or key-management code is written by hand.

A couple is one `SharedOwner`: a 32-byte secret shared between both phones,
deriving the owner id, encryption key, and write key. Each device also holds its
own `AppOwner`.

## Context

The v1 attempt hand-built this layer in Rust — HLC ordering, tombstones, key
epochs, epoch rotation, a blind relay — and it consumed the project without ever
reaching a working login. The lesson taken was not "avoid CRDTs" but "do not
write one yourself".

Evolu was chosen over TinyBase because it is the only candidate where E2EE is
the library's responsibility rather than the application's: the relay is blind
by construction and the protocol type is `EncryptedCrdtMessage`. Its
`SharedOwner` maps exactly onto one couple sharing one chart, and its write keys
are rotatable.

The risk was that Evolu had never been run under Capacitor, with two identified
failure modes. A spike disproved both: OPFS SAH-Pool works in iOS WKWebView
under the custom scheme precisely because it needs no `SharedArrayBuffer` or
COOP/COEP headers, and `instantiateStreaming` never meets Capacitor's patched
`fetch` because the WASM loads inside a Worker whose scope is not patched.

## Consequences

**Two configuration requirements are load-bearing and must not be tidied away.**

1. `installPolyfills()` from `@evolu/common/polyfills` must run at the app entry
   point. Neither WebView has the full explicit-resource-management surface;
   without it the app dies before opening a file.
2. On native, `SharedWorker` must be deleted from `globalThis` before
   `createEvoluDeps()`. iOS 26's WKWebView exposes `SharedWorker`, but it fails
   under `capacitor://localhost` **silently** — no error surfaces and every
   query hangs forever, presenting as a permanent spinner with a clean console.
   Deleting it selects Evolu's one-tab dedicated-Worker path, which Android
   already uses. A Capacitor app is only ever one tab, so nothing is lost.

**The relay learns metadata, not content.** Frames carry the `OwnerId` — it is
in the connection URL by design, for relay auth — plus sizes and timing. So the
constraint "the operator must be structurally unable to read the couple's chart"
holds for *content*: an inspecting proxy over 31 frames found zero plaintext.
It does not mean zero disclosure. A relay operator learns that a given owner
synced, when, and roughly how much. Product and privacy copy must say this
precisely rather than implying more.

**Untested at the time of this decision:** true airplane-mode cold launch on
physical hardware, cross-platform sync over real cellular/NAT, background
suspend and resume, OPFS eviction under storage pressure, charts beyond tens of
rows, and the `@evolu/vue` composables (the spike drove Evolu directly).

# Verdict: can Evolu run inside a Capacitor WebView?

**Yes — on both platforms, with two required configuration changes.**

Neither change is architectural. Nothing about the Evolu decision, the Vue
decision, or ADR 0007 needs revisiting. The TinyBase fallback is **not**
needed.

Date: 2026-08-25 · Branch: `prototype/evolu-capacitor` · Code: `prototype/evolu-capacitor/`

Versions exercised: `@evolu/common` 8.5.0, `@evolu/web` 3.1.0, `@evolu/vue`
2.0.1, `@evolu/sqlite-wasm` 2.2.4, Capacitor 8.5.0, Vue 3.5.41, Vite 8.2.2.

---

## The two required changes

### 1. Call Evolu's polyfills from the app entry point — both platforms

```ts
import { installPolyfills } from "@evolu/common/polyfills";
installPolyfills();
```

Evolu 8 is built on explicit resource management (`using`, `DisposableStack`)
and on the `Map`/`WeakMap` upsert methods. Neither WebView has all of them.
Without this call the app dies before it opens a single file:

| Platform | Failure |
|---|---|
| iOS 26.5 WKWebView | `ReferenceError: Can't find variable: DisposableStack` |
| Android WebView (Chrome 133) | `TypeError: …getOrInsertComputed is not a function` |

Evolu ships these polyfills and its own workers already call `installPolyfills()`.
Only the **main thread** is the app's responsibility, and it is easy to miss —
this spike missed it first time round and reached for a third-party polyfill
instead. Use the supported call.

### 2. On iOS, force Evolu's one-tab path by removing `SharedWorker`

```ts
// Before createEvoluDeps()
if (Capacitor.isNativePlatform()) delete (globalThis as any).SharedWorker;
```

**This is the finding that would have cost the most to discover later.**

iOS 26's WKWebView *does* expose `SharedWorker`, so Evolu uses it. Under the
`capacitor://localhost` custom scheme it then fails, and it fails **silently**:

- the Shared worker evaluates fine, then emits an opaque `Script error.`
  (WebKit sanitises it — the real message, recovered by wrapping the worker
  body, is *"Cross-origin script load denied by Cross-Origin Resource Sharing
  policy."*)
- Evolu surfaces no error at all
- **every query hangs forever.** `loadQuery` simply never resolves.

A UI built on this looks like a permanent loading spinner with a clean console.
Budget nothing for it if you apply the fix; budget days if you meet it cold.

Deleting `SharedWorker` makes Evolu install its own one-tab polyfill (a
dedicated Worker) — the path Android already takes, since Android WebView has
no `SharedWorker` at all. A Capacitor app is only ever one "tab", so nothing is
lost. With the delete: `loadQuery resolved`. Without it: `loadQuery TIMED OUT`.
Both measured on the same build, one flag apart.

---

## Against the four pass/fail criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Evolu initialises and writes a record | **PASS** both platforms | iOS 12 observations, Android 17, accumulating across cold launches. Rows readable 220 ms (iOS) / 263 ms (Android) from boot. |
| 2 | Two devices on one `SharedOwner` converge | **PASS**, incl. cross-platform | iOS↔iOS, then iOS↔Android **bidirectionally**: each device ended holding rows written by the others. |
| 3 | The relay only ever sees ciphertext | **PASS** | 31 frames through an inspecting proxy relay: 0 plaintext hits, printable-byte ratio 13–45% (random-byte range). None of `Low/High/Peak/Missed/Error`, the note text, or device ids appeared. |
| 4 | Cold launch with the network off | **PARTIAL — needs a phone** | Boots, opens and records with the relay unreachable, and reads persisted rows in ~220 ms. True airplane mode (no interface, no DNS) is not reproducible on a simulator. |

### What was NOT tested — read this before acting on the verdict

Everything above is **simulator and emulator**, not the two physical phones the
handoff requires: iPhone 17 Pro + iPhone 17e simulators (iOS 26.5) and a
Pixel-class AVD (Android 16, API 36).

That is a real gap and it is deliberate: the failure modes worth finding turned
out to be reproducible without hardware, and finding them early is worth more
than waiting. The simulator runs the same WKWebView engine as the device, so
criteria 1–3 are unlikely to change. **Criterion 4 genuinely needs a phone**,
and it is the one the handoff calls most important. `RUNBOOK.md` walks it.

Also untested: iOS↔Android with real cellular/NAT between them, background
suspension and resume, storage pressure and OPFS eviction, and large charts
(everything here is tens of rows).

---

## The handoff's two predicted failure modes — both disproven

**1. OPFS SAH-Pool inside iOS WKWebView.** Works, on both platforms. A probe
that opens a sync access handle, writes, reads back and opens **12 concurrent
handles** passes every step on both. The choice of SAH-Pool (no
`SharedArrayBuffer`, no COOP/COEP) is exactly why it survives the custom
scheme; `crossOriginIsolated` is `false` and it does not matter.

**2. `WebAssembly.instantiateStreaming` vs Capacitor's patched `fetch`.** Never
fired, and structurally cannot here. Two independent reasons: the emscripten
glue already wraps `instantiateStreaming` in a `try/catch` and falls back to
`ArrayBuffer` instantiation (`sqlite3.js:312-326`); and the `.wasm` is loaded
inside a **Worker**, whose global scope CapacitorHttp does not patch. `fetch`
measured native in both the main and worker scopes.

**A third failure mode, unlisted, was the one that actually bit** — the
SharedWorker fault above.

---

## Notes that matter for Verelle, beyond the verdict

- **ADR 0007 holds and is load-bearing.** With `server.url` unset, `cap sync`
  writes a native config with no `server` key and the `.wasm` plus both workers
  ship inside the app bundle. Chart35 sets `server.url` and would have loaded
  Evolu's WASM over the network on every cold start.
- **The relay learns metadata, not content.** Frames carry the `OwnerId` (it is
  in the connection URL, by design, for relay auth) plus sizes and timing. So
  the constraint "Jacob must be structurally unable to read the users' chart"
  holds for **content**; a relay operator still learns that a given owner synced
  and roughly how much. Worth stating plainly rather than discovering later.
  This is strictly less leakage than the TinyBase fallback's "relay learns which
  dates have entries".
- **Owner secrets must not live where this prototype put them.** It uses
  `localStorage` for the AppOwner and SharedOwner mnemonics because it is
  throwaway. Verelle must use the platform keystore. If that material is lost,
  the chart is unrecoverable.
- **`exactOptionalPropertyTypes`** is on in the prototype's `tsconfig.json`, as
  the handoff requires.
- **Android cleartext config is a test-harness artifact.** The
  `network_security_config.xml` added here exists only so the local relay
  inspector can be reached over `ws://localhost`. Verelle syncs over `wss://`
  and needs none of it.
- The prototype models an **Observation** with `civilDate`, `monitorReading`,
  `note`, `recordedBy` and nothing derived. No cycle day, no peak count, no
  status, and no UI string applies a judgement to a day — ADR 0001 and ADR 0008
  are respected even in throwaway code.

---

## What this does not settle

The spike answers the storage/sync question only. Still open, and out of scope
here: Pairing UX (the short code that never reaches the server), how owner
material reaches the keystore, chart rendering, and the `@evolu/vue`
composables — the prototype drives Evolu directly rather than through
`EvoluProvider`/`useQuery`, since the Vue binding is plain JS and not what the
WebView threatens.

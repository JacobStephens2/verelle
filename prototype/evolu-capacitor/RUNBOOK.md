# Runbook — reproducing the spike, and the physical-device passes

Everything below runs from `prototype/evolu-capacitor/`. Node 26, Xcode 26,
Android Studio (for its bundled JDK).

```bash
npm install
```

---

## The part that still needs you: criterion 4 on real phones

This is the only criterion a simulator cannot settle, and the handoff calls it
the one that matters most. Roughly 15 minutes.

### iOS

```bash
npm run ios          # builds, syncs, opens Xcode
```

In Xcode: select your iPhone, set a signing team on the `App` target, Run.

Then, **on the phone**:

1. Let it launch once with the network on. The Verdict panel should show
   criterion 1 **PASS**.
2. Swipe the app away from the app switcher — a real cold launch, not a
   background resume.
3. Turn on **airplane mode**. Confirm Wi-Fi is off too.
4. Launch the app.

**Pass looks like:** the Verdict panel fills in, criterion 4 flips to **PASS**,
"online at boot" reads `false`, and the observation count has gone **up** by one
— the launch self-test records an Observation with no network at all.

**Fail looks like:** a blank or spinning screen, "rows readable after: not yet",
or criterion 1 turning FAIL. If so, capture the "Evolu boot log" and "OPFS
sync-access-handle probe" panels — they are on screen precisely so a failure on
a device you cannot attach a debugger to is still legible.

### Android

```bash
npm run android      # builds, syncs, opens Android Studio
```

Run on the device, then the same four steps.

---

## Criterion 2 — two phones converge

1. Install on both phones.
2. On phone A, copy the 24-word mnemonic under **Pairing (SharedOwner)**
   (tapping it copies it).
3. On phone B, paste it into "paste partner's mnemonic" → **Pair & reload**.
4. Record an observation on each.

**Pass:** both phones show `convergence: rows from another device present —
CONVERGED`, and the per-device table lists both device ids.

Note: this pairing flow is deliberately crude. Verelle pairs with a short code
that never reaches the server; retyping a mnemonic is just the cheapest thing
that proves the sync path.

---

## Criterion 3 — confirm the relay only sees ciphertext

```bash
node scripts/inspect-relay.mjs          # proxies to wss://free.evoluhq.com on :4499
```

It prints every frame in both directions with a printable-byte ratio, and exits
non-zero if it ever sees `Low`, `High`, `Peak`, `Missed`, `Error`, `device-`, or
`observation` in a payload.

Point the phones at it via the **3. Relay** field: `ws://<your-LAN-ip>:4499`.
On Android, cleartext to a LAN address is blocked by
`android/app/src/main/res/xml/network_security_config.xml` — add your LAN IP
there, or use the emulator route below.

**Pass:** `plaintext leaks: 0`, printable ratios roughly 10–50%.

---

## Reproducing the automated runs

Two long-lived helpers, each in its own shell:

```bash
node scripts/collector.mjs        # :4500 — receives probe state, writes /tmp/probe-*.json
node scripts/inspect-relay.mjs    # :4499 — inspecting relay proxy
```

### iOS simulator loop (~10s per iteration)

```bash
xcrun simctl boot "iPhone 17 Pro"
npm run ios                                  # once, to install the shell
./scripts/ios-loop.sh                        # thereafter: rebuild + hot-swap + relaunch
```

It skips `xcodebuild` entirely by swapping the web assets inside the installed
app container, and prints the probe's stage, boot log and OPFS results.

Toggle the iOS SharedWorker finding to see it directly:

```bash
VITE_PROBE_ONE_TAB=false ./scripts/ios-loop.sh   # loadQuery TIMED OUT after 4s
VITE_PROBE_ONE_TAB=true  ./scripts/ios-loop.sh   # loadQuery resolved
```

### Android emulator loop

```bash
emulator -avd <your-avd> &
adb reverse tcp:4499 tcp:4499 && adb reverse tcp:4500 tcp:4500
./scripts/android-loop.sh
```

Android reads the probe out of **logcat**, not the network: its `https://localhost`
origin blocks a cleartext POST as mixed content, and logcat keeps working with
the network off.

### Two devices converging, unattended

```bash
MNEMONIC="<24 words>" APP=<path to built App.app> ./scripts/two-device-test.sh
```

Seeds both simulators with one SharedOwner at build time so nothing has to be
retyped, then reports each device's row counts. Convergence is proven when the
second device reports rows from **both** devices.

---

## Build-time switches

| Variable | Effect |
|---|---|
| `VITE_PROBE_REPORT` | URL the probe POSTs its state to. **Unset in any device build** — without it no reporting code is compiled in at all. |
| `VITE_PROBE_RELAY` | Overrides the default relay (`wss://free.evoluhq.com`). |
| `VITE_PROBE_SHARED_MNEMONIC` | Seeds the SharedOwner so two shells start already paired. |
| `VITE_PROBE_ONE_TAB` | `true`/`false` forces the iOS SharedWorker workaround on or off. Defaults to on for native shells. |

## What is where

| Path | What it is |
|---|---|
| `src/polyfill-disposable.ts` | Required change 1 — the polyfill call |
| `src/evolu.ts` | Evolu boot, owners, and required change 2 (the `SharedWorker` delete) |
| `src/opfs-probe.worker.ts` | Raw OPFS sync-access-handle probe, no Evolu involved — tells you whether a failure is the WebView's or Evolu's |
| `src/probe-env.ts` | What kind of JS environment the app booted into |
| `src/App.vue` | The whole UI: verdict panel, boot log, probe results |
| `scripts/inspect-relay.mjs` | The relay that proves criterion 3 |
| `capacitor.config.ts` | ADR 0007 — note the deliberate absence of `server.url` |

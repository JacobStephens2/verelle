<script setup lang="ts">
/// PROTOTYPE. Throwaway.
// The phone is the only output device, so everything gets rendered. No console.
import { onMounted, ref, computed } from "vue";
import { collectEnvFacts, probeWorkerFetch, type Fact } from "./probe-env";
import type { OpfsProbeResult } from "./opfs-probe.worker";
import {
  bootEvolu,
  DEFAULT_RELAY,
  getRelayUrl,
  setRelayUrl,
  pairWithMnemonic,
  sharedOwnerState,
  appOwnerState,
  wipeLocalState,
  Schema,
} from "./evolu";
import { createQueryBuilder, NonEmptyTrimmedString1000 } from "@evolu/common";
import { report } from "./report";

// Captured at module load, before anything touches the network. Criterion 4
// hinges on this being trustworthy, so it is read as early as possible.
const bootStartedAt = performance.now();
const wasOnlineAtBoot = navigator.onLine;

const onlineNow = ref(navigator.onLine);
addEventListener("online", () => (onlineNow.value = true));
addEventListener("offline", () => (onlineNow.value = false));

const deviceId = (() => {
  const k = "verelle-probe.deviceId";
  let v = localStorage.getItem(k);
  if (!v) {
    v = `device-${Math.random().toString(36).slice(2, 7)}`;
    localStorage.setItem(k, v);
  }
  return v;
})();

const facts = ref<Array<Fact>>([]);
const workerFetch = ref("checking…");
const opfs = ref<Array<OpfsProbeResult>>([]);
const opfsError = ref("");

const bootLog = ref<Array<string>>([]);
const evoluStatus = ref<"booting" | "ok" | "failed">("booting");
const evoluError = ref("");
const evolu = ref<any>(null);

const rows = ref<Array<any>>([]);
const firstRowsAt = ref<number | null>(null);
const rowsLoadedOffline = ref(false);

const stage = ref("starting");
const relayInput = ref(getRelayUrl());
const pairInput = ref("");
const pairError = ref("");

const draftDate = ref(new Date().toISOString().slice(0, 10));
const draftReading = ref("Low");
const draftNote = ref("");

// Written automatically on every launch. On a phone with the network off,
// this is what proves criterion 4: the app not only opens, it records.
const selfTestWrote = ref(false);

const q = createQueryBuilder(Schema as any);
const allObservations = q((db: any) =>
  db.selectFrom("observation").selectAll().orderBy("civilDate", "desc"),
);

const refresh = () => {
  if (!evolu.value) return;
  rows.value = [...evolu.value.getQueryRows(allObservations)];
  if (firstRowsAt.value === null) {
    firstRowsAt.value = Math.round(performance.now() - bootStartedAt);
    rowsLoadedOffline.value = !navigator.onLine;
  }
};

const addObservation = (note?: string) => {
  if (!evolu.value) return;
  // Stored verbatim. Nothing here is interpreted, scored, or classified.
  evolu.value.insert(
    "observation",
    {
      civilDate: NonEmptyTrimmedString1000.orThrow(draftDate.value),
      monitorReading: NonEmptyTrimmedString1000.orThrow(draftReading.value),
      note: NonEmptyTrimmedString1000.orThrow(note ?? draftNote.value ?? "—"),
      recordedBy: NonEmptyTrimmedString1000.orThrow(deviceId),
    },
    // The couple's chart belongs to the SharedOwner. This is what syncs.
    { ownerId: sharedOwnerState.owner.id },
  );
  draftNote.value = "";
};

type Check = { n: string; label: string; state: "pass" | "fail" | "pending" };

// The four pass/fail criteria from the handoff, evaluated live. Criterion 3
// (relay sees only ciphertext) cannot be judged from inside the app — it is
// checked at the relay — so it is reported as such rather than faked.
const criteria = computed<Array<Check>>(() => [
  {
    n: "1",
    label: "Evolu initialises and writes a record",
    state:
      evoluStatus.value === "failed"
        ? "fail"
        : selfTestWrote.value && rows.value.length > 0
          ? "pass"
          : "pending",
  },
  {
    n: "2",
    label: "Two devices sharing one SharedOwner converge",
    state: hasForeignRows.value ? "pass" : "pending",
  },
  { n: "3", label: "Relay sees only ciphertext (checked at the relay)", state: "pending" },
  {
    n: "4",
    label: "Cold launch with network off opens and records",
    state: !wasOnlineAtBoot && selfTestWrote.value ? "pass" : "pending",
  },
]);

const byDevice = computed(() => {
  const m = new Map<string, number>();
  for (const r of rows.value) m.set(r.recordedBy, (m.get(r.recordedBy) ?? 0) + 1);
  return [...m.entries()];
});

// Criterion 2 is convergence, which means rows from a device that is not this
// one. That is the only thing that proves the relay actually moved data.
const hasForeignRows = computed(() =>
  rows.value.some((r) => r.recordedBy !== deviceId),
);

const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard is a nicety; the mnemonic is on screen regardless */
  }
};

const doPair = () => {
  pairError.value = "";
  try {
    pairWithMnemonic(pairInput.value);
  } catch (e) {
    pairError.value = String(e);
  }
};

const saveRelay = () => {
  setRelayUrl(relayInput.value.trim());
  location.reload();
};

onMounted(async () => {
  facts.value = collectEnvFacts();
  void probeWorkerFetch().then((v) => (workerFetch.value = v));

  // Probe raw OPFS before Evolu, so a failure can be attributed to the WebView
  // rather than to Evolu.
  try {
    const w = new Worker(new URL("./opfs-probe.worker.ts", import.meta.url), {
      type: "module",
    });
    w.onmessage = (e: MessageEvent<Array<OpfsProbeResult>>) => {
      opfs.value = e.data;
      w.terminate();
    };
    w.onerror = (e) => {
      opfsError.value = `worker failed to start: ${e.message}`;
    };
  } catch (e) {
    opfsError.value = String(e);
  }

  const result = await bootEvolu((line) => bootLog.value.push(line));
  if (!result.ok) {
    evoluStatus.value = "failed";
    evoluError.value = result.error;
    report("boot-failed", { error: result.error, log: result.log, facts: facts.value });
    return;
  }

  evolu.value = result.evolu;
  evoluStatus.value = "ok";
  report("booted", { log: result.log, facts: facts.value, opfs: opfs.value });

  // The symptom under diagnosis: loadQuery resolving, throwing, or hanging are
  // three different bugs and the panel must not conflate them.
  stage.value = "loadQuery pending";
  try {
    const raced = await Promise.race([
      result.evolu.loadQuery(allObservations).then(() => "resolved"),
      new Promise<string>((r) => setTimeout(() => r("TIMED OUT after 4s"), 4000)),
    ]);
    stage.value = `loadQuery ${raced}`;
  } catch (e) {
    stage.value = `loadQuery THREW: ${String(e)}`;
  }
  report("after-loadQuery", {
    detail: stage.value,
    lateLog: bootLog.value,
    log: result.log,
    opfs: opfs.value,
    facts: facts.value,
  });

  try {
    refresh();
    result.evolu.subscribeQuery(allObservations)(refresh);
    stage.value += " | subscribed";
    addObservation("launch self-test");
    selfTestWrote.value = true;
  } catch (e) {
    stage.value += ` | refresh THREW: ${String(e)}`;
  }
  // The insert lands asynchronously; give it a beat so the count is real.
  setTimeout(
    () =>
      report("final", {
        detail: stage.value,
        rows: rows.value.length,
        devices: byDevice.value,
        wasOnlineAtBoot,
        criteria: criteria.value,
        opfs: opfs.value,
        facts: facts.value,
      }),
    1500,
  );
  // Sync lands well after the first paint; sample again so convergence has a
  // fair chance to show up before the harness stops looking.
  setTimeout(
    () =>
      report("late", {
        detail: stage.value,
        rows: rows.value.length,
        devices: byDevice.value,
        criteria: criteria.value,
      }),
    8000,
  );
  report("after-refresh", {
    detail: stage.value,
    rows: rows.value.length,
    devices: byDevice.value,
    wasOnlineAtBoot,
  });
});
</script>

<template>
  <main>
    <p class="banner">PROTOTYPE — Evolu under Capacitor. Throwaway. Not Verelle.</p>
    <p class="device">this device: <b>{{ deviceId }}</b></p>

    <section>
      <h2>Verdict</h2>
      <table>
        <tr v-for="c in criteria" :key="c.n">
          <td>{{ c.n }}</td>
          <td>{{ c.label }}</td>
          <td :class="c.state === 'pass' ? 'ok' : c.state === 'fail' ? 'bad' : 'info'">
            {{ c.state.toUpperCase() }}
          </td>
        </tr>
      </table>
      <p class="hint">
        PENDING means not yet demonstrated on this device, not failed. 2 needs
        the partner phone; 3 is read off the relay; 4 needs airplane mode.
      </p>
    </section>

    <section>
      <h2>4. Cold launch, network off</h2>
      <p class="hint">
        Kill the app, turn on airplane mode, relaunch. This panel must still
        fill in. It is the criterion that matters most.
      </p>
      <table>
        <tr><td>online at boot</td><td>{{ wasOnlineAtBoot }}</td></tr>
        <tr><td>online now</td><td>{{ onlineNow }}</td></tr>
        <tr>
          <td>rows readable after</td>
          <td :class="firstRowsAt === null ? 'bad' : 'ok'">
            {{ firstRowsAt === null ? "not yet" : firstRowsAt + " ms from boot" }}
          </td>
        </tr>
        <tr>
          <td>…and network was off</td>
          <td :class="rowsLoadedOffline ? 'ok' : 'info'">
            {{ rowsLoadedOffline ? "YES — offline read proven" : "no (was online)" }}
          </td>
        </tr>
      </table>
    </section>

    <section>
      <h2>1 &amp; 2. Observations ({{ rows.length }})</h2>
      <p v-if="evoluStatus === 'booting'" class="info">Evolu booting…</p>
      <p v-else-if="evoluStatus === 'failed'" class="bad">Evolu failed to boot — see below.</p>
      <template v-else>
        <div class="form">
          <input v-model="draftDate" placeholder="civil date" />
          <select v-model="draftReading">
            <option>Low</option><option>High</option><option>Peak</option>
            <option>Missed</option><option>Error</option>
          </select>
          <input v-model="draftNote" placeholder="note" />
          <button @click="addObservation()">Record observation</button>
        </div>
        <p :class="hasForeignRows ? 'ok' : 'info'">
          convergence:
          {{ hasForeignRows ? "rows from another device present — CONVERGED" : "only this device's rows so far" }}
        </p>
        <table>
          <tr v-for="[dev, n] in byDevice" :key="dev">
            <td>{{ dev }}</td><td>{{ n }} rows</td>
          </tr>
        </table>
        <table class="rows">
          <tr v-for="r in rows.slice(0, 25)" :key="r.id">
            <td>{{ r.civilDate }}</td>
            <td>{{ r.monitorReading }}</td>
            <td>{{ r.note }}</td>
            <td>{{ r.recordedBy }}</td>
          </tr>
        </table>
      </template>
    </section>

    <section>
      <h2>Pairing (SharedOwner)</h2>
      <p class="hint">
        Both phones must hold the same SharedOwner. Copy this from phone A,
        paste into phone B.
      </p>
      <pre class="mnemonic" @click="copy(sharedOwnerState.mnemonic)">{{ sharedOwnerState.mnemonic }}</pre>
      <p class="hint">shared owner id: {{ sharedOwnerState.owner.id }}</p>
      <div class="form">
        <input v-model="pairInput" placeholder="paste partner's mnemonic" />
        <button @click="doPair">Pair &amp; reload</button>
      </div>
      <p v-if="pairError" class="bad">{{ pairError }}</p>
    </section>

    <section>
      <h2>3. Relay</h2>
      <div class="form">
        <input v-model="relayInput" placeholder="wss://…" />
        <button @click="saveRelay">Save &amp; reload</button>
      </div>
      <p class="hint">
        default {{ DEFAULT_RELAY }}. Point this at the local relay in RUNBOOK.md
        to read the frames and confirm they are ciphertext.
      </p>
      <p class="hint">app owner id: {{ appOwnerState.owner.id }}</p>
    </section>

    <section>
      <h2>Evolu boot log</h2>
      <p :class="evoluStatus === 'ok' ? 'ok' : evoluStatus === 'failed' ? 'bad' : 'info'">
        status: {{ evoluStatus }}
      </p>
      <p :class="stage.includes('TIMED OUT') || stage.includes('THREW') ? 'bad' : 'info'">
        stage: {{ stage }}
      </p>
      <pre>{{ bootLog.join("\n") }}</pre>
      <pre v-if="evoluError" class="bad">{{ evoluError }}</pre>
    </section>

    <section>
      <h2>OPFS sync-access-handle probe (no Evolu)</h2>
      <p v-if="opfsError" class="bad">{{ opfsError }}</p>
      <p v-else-if="!opfs.length" class="info">running…</p>
      <table v-else>
        <tr v-for="(r, i) in opfs" :key="i">
          <td>{{ r.step }}</td>
          <td :class="r.ok ? 'ok' : 'bad'">{{ r.ok ? "ok" : "FAIL" }}</td>
          <td class="detail">{{ r.detail }}</td>
        </tr>
      </table>
    </section>

    <section>
      <h2>Environment</h2>
      <table>
        <tr v-for="f in facts" :key="f.name">
          <td>{{ f.name }}</td>
          <td :class="f.verdict" class="detail">{{ f.value }}</td>
        </tr>
        <tr>
          <td>worker-scope fetch</td>
          <td class="detail" :class="workerFetch === 'native' ? 'ok' : 'warn'">{{ workerFetch }}</td>
        </tr>
      </table>
    </section>

    <section>
      <button class="danger" @click="wipeLocalState">Wipe local state</button>
      <p class="hint">Clears owners and reloads. OPFS data is left behind on purpose.</p>
    </section>
  </main>
</template>

<style>
:root { color-scheme: light dark; }
body { margin: 0; font: 14px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }
main { padding: max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom)); }
.banner { background: #b45309; color: #fff; padding: 8px; margin: 0 -12px 12px; font-weight: 700; }
.device { opacity: .7; }
section { border-top: 1px solid currentColor; padding: 10px 0; }
h2 { font-size: 15px; margin: 0 0 6px; }
table { width: 100%; border-collapse: collapse; }
td { padding: 3px 4px; vertical-align: top; border-bottom: 1px solid rgba(128,128,128,.25); }
td:first-child { opacity: .7; white-space: nowrap; }
.detail { word-break: break-all; }
pre { white-space: pre-wrap; word-break: break-all; background: rgba(128,128,128,.15); padding: 8px; }
.mnemonic { font-size: 13px; }
.form { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
.form input, .form select { flex: 1 1 120px; padding: 8px; font: inherit; }
button { padding: 10px 12px; font: inherit; }
.danger { background: #b91c1c; color: #fff; }
.ok { color: #15803d; font-weight: 700; }
.bad { color: #b91c1c; font-weight: 700; }
.warn { color: #b45309; font-weight: 700; }
.info { opacity: .75; }
.hint { opacity: .7; font-size: 13px; }
.rows td { font-size: 12px; }
</style>

/// PROTOTYPE. Throwaway.
// The narrowest Evolu setup that still exercises everything the spike must
// prove: a schema, a persisted AppOwner, a SharedOwner for the couple, and a
// relay transport.
//
// Owner secrets live in localStorage here. That is a PROTOTYPE SHORTCUT and is
// wrong for Verelle — real owner material belongs in the platform keystore.

import {
  AppName,
  createAppOwner,
  createEvolu,
  createOwnerSecret,
  createOwnerWebSocketTransport,
  createRandomBytes,
  createRun,
  createSharedOwner,
  id,
  Mnemonic,
  mnemonicToOwnerSecret,
  NonEmptyTrimmedString1000,
  ownerSecretToMnemonic,
  type AppOwner,
  type SharedOwner,
} from "@evolu/common";
import { createEvoluDeps } from "@evolu/web";

// Deliberately domain-shaped but interpretation-free. An Observation stores
// what was recorded and nothing derived from it — no cycle day, no peak count,
// no status. See CONTEXT.md and ADR 0001.
export const Schema = {
  observation: {
    id: id("Observation"),
    civilDate: NonEmptyTrimmedString1000, // "2026-08-25", recorder's own timezone
    monitorReading: NonEmptyTrimmedString1000, // Low | High | Peak | Missed | Error
    note: NonEmptyTrimmedString1000,
    recordedBy: NonEmptyTrimmedString1000, // which device wrote it
  },
};

const APP_OWNER_KEY = "verelle-probe.appOwnerMnemonic";
const SHARED_OWNER_KEY = "verelle-probe.sharedOwnerMnemonic";
const RELAY_KEY = "verelle-probe.relayUrl";

// VITE_PROBE_RELAY lets a build point at the inspecting relay without anyone
// typing a URL on a phone keyboard.
export const DEFAULT_RELAY =
  (import.meta.env.VITE_PROBE_RELAY as string | undefined) ?? "wss://free.evoluhq.com";

const ONE_TAB_KEY = "verelle-probe.forceOneTab";
/** Default on for native shells; toggleable so the difference is measurable. */
export const forceOneTab = (): boolean => {
  const env = import.meta.env.VITE_PROBE_ONE_TAB as string | undefined;
  if (env !== undefined) return env === "true";
  const v = localStorage.getItem(ONE_TAB_KEY);
  if (v !== null) return v === "true";
  return Boolean((globalThis as any).Capacitor?.isNativePlatform?.());
};
export const setForceOneTab = (v: boolean): void => {
  localStorage.setItem(ONE_TAB_KEY, String(v));
  location.reload();
};

export const getRelayUrl = (): string =>
  localStorage.getItem(RELAY_KEY) ?? DEFAULT_RELAY;

export const setRelayUrl = (url: string): void => {
  localStorage.setItem(RELAY_KEY, url);
};

const randomBytes = createRandomBytes();

/** Restores the persisted owner, or mints one on first run. */
const loadOrCreateOwner = <T>(
  key: string,
  fromSecret: (secret: ReturnType<typeof createOwnerSecret>) => T,
): { owner: T; mnemonic: string; created: boolean } => {
  const stored = localStorage.getItem(key);
  if (stored) {
    const secret = mnemonicToOwnerSecret(Mnemonic.orThrow(stored));
    return { owner: fromSecret(secret), mnemonic: stored, created: false };
  }
  const secret = createOwnerSecret({ randomBytes });
  const mnemonic = ownerSecretToMnemonic(secret);
  localStorage.setItem(key, mnemonic);
  return { owner: fromSecret(secret), mnemonic, created: true };
};

// A build-time SharedOwner lets two shells start already paired, so
// convergence can be tested without a human retyping 24 words. On real devices
// pairing goes through the UI instead.
const SEEDED_SHARED = import.meta.env.VITE_PROBE_SHARED_MNEMONIC as string | undefined;
if (SEEDED_SHARED) localStorage.setItem(SHARED_OWNER_KEY, SEEDED_SHARED.trim());

export const appOwnerState = loadOrCreateOwner<AppOwner>(APP_OWNER_KEY, createAppOwner);
export const sharedOwnerState = loadOrCreateOwner<SharedOwner>(
  SHARED_OWNER_KEY,
  createSharedOwner,
);

/**
 * Replaces the SharedOwner with one restored from the partner's mnemonic, then
 * reloads. This stands in for Pairing — in Verelle the mnemonic never gets
 * typed by a human, a short code carries it. Here, typing it is the point.
 */
export const pairWithMnemonic = (mnemonic: string): void => {
  // Throws on a malformed mnemonic; the caller surfaces that to the screen.
  mnemonicToOwnerSecret(Mnemonic.orThrow(mnemonic.trim()));
  localStorage.setItem(SHARED_OWNER_KEY, mnemonic.trim());
  location.reload();
};

export const wipeLocalState = (): void => {
  localStorage.clear();
  location.reload();
};

export type EvoluBootResult =
  | { ok: true; evolu: any; log: Array<string> }
  | { ok: false; error: string; log: Array<string> };

/**
 * Boots Evolu and reports how far it got. Every stage is logged because on a
 * phone there is no console to read — the screen is the only output device.
 */
/**
 * Evolu owns its workers, so a worker that dies is invisible from here —
 * loadQuery just awaits a reply forever. Wrapping the constructors is the only
 * seam that surfaces it. This is how the SharedWorker fault below was found.
 */
export const instrumentWorkers = (say: (s: string) => void): void => {
  const wrap = (Ctor: any, kind: string) =>
    new Proxy(Ctor, {
      construct(target, args: Array<any>) {
        const url = String(args[0]);
        const short = url.slice(url.lastIndexOf("/") + 1);
        say(`${kind} spawn ${short}`);
        const w = new target(...args);
        const target_ = kind === "SharedWorker" ? w.port : w;
        w.addEventListener?.("error", (e: any) => {
          say(`${kind} ERROR ${short}: ${e.message ?? e.type} @${e.filename}:${e.lineno}`);
        });
        target_?.addEventListener?.("messageerror", (e: any) => {
          say(`${kind} MESSAGEERROR ${short}: ${String(e)}`);
        });
        return w;
      },
    });
  (globalThis as any).Worker = wrap((globalThis as any).Worker, "Worker");
  if ((globalThis as any).SharedWorker)
    (globalThis as any).SharedWorker = wrap((globalThis as any).SharedWorker, "SharedWorker");
};

export const bootEvolu = async (
  onLog: (line: string) => void,
): Promise<EvoluBootResult> => {
  const log: Array<string> = [];
  const say = (line: string) => {
    log.push(line);
    onLog(line);
  };

  try {
    instrumentWorkers(say);

    // WKWebView does expose SharedWorker, but under the capacitor:// custom
    // scheme it errors out and Evolu's queries never resolve. A Capacitor app
    // is only ever one "tab", so removing it costs nothing and routes Evolu
    // through its one-tab dedicated-Worker polyfill instead.
    if (forceOneTab()) {
      delete (globalThis as any).SharedWorker;
      say("SharedWorker removed — forcing Evolu's one-tab dedicated Worker");
    }
    say("creating web deps (installs one-tab SharedWorker polyfill)…");
    let sharedWorkerUnsupported = false;
    const deps = createEvoluDeps({
      onSharedWorkerUnsupported: () => {
        sharedWorkerUnsupported = true;
        say("SharedWorker unsupported — one-tab mode (expected in a WebView)");
      },
    });
    say("web deps created");

    const relayUrl = getRelayUrl();
    const transports = relayUrl
      ? [
          createOwnerWebSocketTransport({
            url: relayUrl,
            ownerId: appOwnerState.owner.id,
          }),
        ]
      : [];
    say(`transport: ${relayUrl || "(none — local only)"}`);

    say("createRun(deps)…");
    const run = createRun(deps as any);

    say("running createEvolu — this is where SQLite-WASM loads and OPFS opens…");
    const result: any = await run(
      createEvolu(Schema as any, {
        appName: AppName.orThrow("VerelleProbe"),
        appOwner: appOwnerState.owner,
        transports: transports as any,
      }) as any,
    );

    if (result && result.ok === false) {
      say(`createEvolu returned err: ${JSON.stringify(result.error)}`);
      return { ok: false, error: JSON.stringify(result.error), log };
    }

    const evolu = result?.value ?? result;
    say("Evolu instance created");
    say(`instance name: ${evolu.name ?? "(unknown)"}`);
    if (sharedWorkerUnsupported) say("note: ran without a native SharedWorker");

    // The couple's chart lives on the SharedOwner, not the AppOwner. Syncing it
    // is what makes two phones converge.
    say("registering SharedOwner for sync…");
    evolu.useOwner(
      sharedOwnerState.owner,
      relayUrl
        ? [
            createOwnerWebSocketTransport({
              url: relayUrl,
              ownerId: sharedOwnerState.owner.id,
            }),
          ]
        : undefined,
    );
    say("SharedOwner registered");

    return { ok: true, evolu, log };
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e);
    say(`THREW: ${msg}`);
    // On a phone there is no console, and the log lives far down the page.
    // Put the failure where the first screenshot will catch it.
    const el = document.createElement("pre");
    el.style.cssText =
      "background:#b91c1c;color:#fff;padding:8px;white-space:pre-wrap;font-size:11px";
    el.textContent = `EVOLU BOOT FAILED\n${msg}\n\n--- log ---\n${log.join("\n")}`;
    document.body.prepend(el);
    return { ok: false, error: msg, log };
  }
};

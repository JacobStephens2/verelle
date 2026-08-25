/// PROTOTYPE. Throwaway.
// Synchronous facts about the JS environment the app booted into. These are
// what distinguish "a browser tab" from "a Capacitor WebView" and they decide
// whether the rest of the stack can work at all.

export type Fact = { name: string; value: string; verdict: "ok" | "warn" | "bad" | "info" };

const has = (v: unknown) => typeof v !== "undefined";

export const collectEnvFacts = (): Array<Fact> => {
  const cap = (globalThis as any).Capacitor;
  const facts: Array<Fact> = [];

  facts.push({
    name: "Capacitor platform",
    value: cap?.getPlatform?.() ?? "not present (plain browser)",
    verdict: "info",
  });
  facts.push({
    name: "native shell",
    value: String(cap?.isNativePlatform?.() ?? false),
    verdict: "info",
  });
  facts.push({ name: "location.origin", value: location.origin, verdict: "info" });
  facts.push({ name: "location.protocol", value: location.protocol, verdict: "info" });

  // OPFS is gated on a secure context. Capacitor's custom schemes are supposed
  // to count as secure; this is the check that proves it on device.
  facts.push({
    name: "isSecureContext",
    value: String(isSecureContext),
    verdict: isSecureContext ? "ok" : "bad",
  });

  // Expected false, and that is fine: Evolu uses the SAH-Pool VFS precisely so
  // it needs no COOP/COEP and no SharedArrayBuffer.
  facts.push({
    name: "crossOriginIsolated",
    value: String(crossOriginIsolated),
    verdict: "info",
  });
  facts.push({
    name: "SharedArrayBuffer",
    value: has((globalThis as any).SharedArrayBuffer) ? "present" : "absent (expected, not needed)",
    verdict: "info",
  });

  facts.push({
    name: "Worker",
    value: has(globalThis.Worker) ? "present" : "ABSENT",
    verdict: has(globalThis.Worker) ? "ok" : "bad",
  });

  // Neither WKWebView nor Android WebView ships SharedWorker. Evolu installs a
  // one-tab polyfill for this, so absence is survivable — but it means Evolu
  // runs in single-client mode, which is all a Capacitor app ever needs.
  const nativeSharedWorker = has((globalThis as any).SharedWorker);
  facts.push({
    name: "SharedWorker (native)",
    value: nativeSharedWorker ? "present" : "absent — Evolu one-tab polyfill takes over",
    verdict: nativeSharedWorker ? "ok" : "warn",
  });

  facts.push({
    name: "navigator.locks",
    value: has(navigator.locks) ? "present" : "ABSENT",
    verdict: has(navigator.locks) ? "ok" : "bad",
  });
  facts.push({
    name: "BroadcastChannel",
    value: has(globalThis.BroadcastChannel) ? "present" : "ABSENT",
    verdict: has(globalThis.BroadcastChannel) ? "ok" : "bad",
  });
  facts.push({
    name: "navigator.storage.getDirectory",
    value: typeof navigator.storage?.getDirectory === "function" ? "present" : "ABSENT",
    verdict: typeof navigator.storage?.getDirectory === "function" ? "ok" : "bad",
  });
  facts.push({
    name: "WebAssembly.instantiateStreaming",
    value: has(WebAssembly.instantiateStreaming)
      ? "present"
      : "absent — emscripten falls back to ArrayBuffer",
    verdict: "info",
  });

  // Failure mode 2 from the handoff. CapacitorHttp replaces window.fetch when
  // enabled. Even patched, it only affects the main scope — workers keep the
  // native fetch — but record it so a failure can be attributed.
  const fetchSrc = String(globalThis.fetch);
  const patched = !fetchSrc.includes("[native code]");
  facts.push({
    name: "window.fetch",
    value: patched ? "PATCHED (CapacitorHttp likely on)" : "native",
    verdict: patched ? "warn" : "ok",
  });

  facts.push({ name: "userAgent", value: navigator.userAgent, verdict: "info" });
  return facts;
};

// Whether the *worker* scope keeps a native fetch is the question that actually
// decides failure mode 2, because that is where the .wasm is loaded.
export const probeWorkerFetch = (): Promise<string> =>
  new Promise((resolve) => {
    const src = `self.postMessage(String(self.fetch));`;
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    const w = new Worker(url);
    const done = (v: string) => {
      w.terminate();
      URL.revokeObjectURL(url);
      resolve(v);
    };
    w.onmessage = (e: MessageEvent<string>) =>
      done(String(e.data).includes("[native code]") ? "native" : "PATCHED");
    w.onerror = (e) => done(`worker failed: ${e.message}`);
    setTimeout(() => done("timed out"), 5000);
  });

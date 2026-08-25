/// PROTOTYPE. Throwaway.
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

/**
 * Diagnostics only. Evolu's workers are opaque from the main thread in a
 * WebView — a worker that fails is silent and queries just never resolve — so
 * when VITE_PROBE_REPORT is set they are given a beacon that reports from the
 * inside. Nothing here is injected in a normal build.
 */
const polyfillEvoluWorkers = () => ({
  name: "polyfill-evolu-workers",
  enforce: "pre" as const,
  renderChunk(code: string, chunk: any) {
    if (!process.env.VITE_PROBE_REPORT) return null;
    if (!/(Db|Shared)\.worker/.test(chunk.fileName ?? "")) return null;
    const name = chunk.fileName.includes("Db.worker") ? "Db" : "Shared";
    const u = JSON.stringify(process.env.VITE_PROBE_REPORT);
    // The bundled worker has no imports left, so a try/catch here yields the
    // real evaluation error instead of WebKit's sanitized "Script error."
    return {
      code:
        `const __say=(w,x)=>{const b=JSON.stringify({stage:"worker-${name}-"+w,detail:String(x||"")});` +
        `console.log("PROBE_REPORT "+b);` +
        `try{fetch(${u},{method:"POST",headers:{"content-type":"application/json"},body:b}).catch(()=>{})}catch{}};\n` +
        `self.addEventListener("error",e=>__say("evt",(e.message||"")+" @"+e.filename+":"+e.lineno));\n` +
        `self.addEventListener("unhandledrejection",e=>__say("rejection",(e.reason&&(e.reason.stack||e.reason.message))||e.reason));\n` +
        `__say("start",self.location.href);\n` +
        `try {\n${code}\n__say("evaluated","ok");\n} catch (e) { __say("caught",(e&&(e.stack||e.message))||String(e)); }\n`,
      map: null,
    };
  },
  transform(code: string, id: string) {
    if (!/@evolu[\\/].*(Db|Shared)\.worker\.(ts|js)$/.test(id)) return null;
    const name = id.includes("Db.worker") ? "Db" : "Shared";
    // `?evolu-real` is the unwrapped pass: emit the original body, no shim,
    // otherwise the shim would import itself forever.
    // A worker that throws during module evaluation is silent from the main
    // thread in WKWebView, so it has to report from inside itself.
    const beacon = process.env.VITE_PROBE_REPORT
      ? `
const __u = ${JSON.stringify(process.env.VITE_PROBE_REPORT)};
const __say = (what, extra) => { const b = JSON.stringify({stage:"worker-${name}-"+what, detail:String(extra||"")});
  console.log("PROBE_REPORT " + b);
  try { fetch(__u, {method:"POST",headers:{"content-type":"application/json"}, body: b}).catch(() => {}); } catch {} };
self.addEventListener("error", (e) => __say("error", (e.message||"")+" @"+e.filename+":"+e.lineno+" | "+((e.error&&(e.error.stack||e.error.message))||"no .error")));
self.addEventListener("unhandledrejection", (e) => __say("rejection", (e.reason && (e.reason.stack||e.reason.message)) || e.reason));
__say("start", self.location.href);
`
      : "";
    return beacon ? { code: `${beacon}${code}`, map: null } : null;
  },
});

export default defineConfig({
  plugins: [polyfillEvoluWorkers(), vue()],
  // Capacitor serves bundled assets from the origin root under a custom
  // scheme. Relative base keeps every asset URL valid there.
  base: "./",
  worker: {
    // Evolu's workers are ES modules and import each other; the iife default
    // cannot express that.
    format: "es",
    // Worker builds get their own plugin container — plugins listed above do
    // not reach them, so the beacon transform must be registered again here.
    plugins: () => [polyfillEvoluWorkers()],
  },
  optimizeDeps: {
    // The sqlite-wasm glue must not be pre-bundled — esbuild rewrites the
    // import.meta.url the .wasm lookup depends on.
    exclude: ["@evolu/common", "@evolu/web", "@evolu/sqlite-wasm"],
  },
  server: { host: true },
});

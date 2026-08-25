/// PROTOTYPE. Throwaway — debug channel only.
// The simulator has no console I can read, so the probe POSTs its state here
// and this prints it. Gives the diagnosis loop a text signal instead of a
// screenshot. Never enabled unless VITE_PROBE_REPORT is set at build time.

import { createServer } from "node:http";
import { writeFileSync } from "node:fs";

const PORT = Number(process.env.PORT ?? 4500);
const OUT = process.env.OUT ?? "/tmp/probe-report.json";

createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "POST") {
    res.statusCode = 404;
    return res.end();
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.end("ok");
    writeFileSync(OUT, body);
    try {
      writeFileSync(`/tmp/probe-${JSON.parse(body).stage}.json`, body);
    } catch {}
    try {
      const r = JSON.parse(body);
      console.log(`\n===== report @ ${r.stage} =====`);
      console.log(JSON.stringify(r, null, 2));
    } catch {
      console.log("unparseable:", body.slice(0, 500));
    }
  });
}).listen(PORT, () => console.log(`collector on :${PORT} -> ${OUT}`));

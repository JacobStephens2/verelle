/// PROTOTYPE. Throwaway.
// A relay that prints every frame it forwards, so criterion 3 is *observed*
// rather than trusted. It wraps the real Evolu relay: clients connect here,
// this proxies to the upstream relay, and every byte in both directions is
// dumped with a printable-ASCII ratio.
//
//   node scripts/inspect-relay.mjs            # proxy to wss://free.evoluhq.com
//   node scripts/inspect-relay.mjs --upstream wss://my-relay
//
// Then point the app's relay field at ws://<your-lan-ip>:4499.

import { WebSocketServer, WebSocket } from "ws";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const PORT = Number(arg("port", "4499"));
const UPSTREAM = arg("upstream", "wss://free.evoluhq.com");

// Anything the couple typed would show up as runs of printable ASCII. Ciphertext
// does not. This is a crude test and that is the point — it needs no trust.
const printableRatio = (buf) => {
  let n = 0;
  for (const b of buf) if (b >= 0x20 && b <= 0x7e) n++;
  return buf.length ? n / buf.length : 0;
};

const LOOK_FOR = ["Low", "High", "Peak", "Missed", "Error", "device-", "observation"];

const dump = (dir, data) => {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const ratio = printableRatio(buf);
  const text = buf.toString("latin1");
  const leaks = LOOK_FOR.filter((w) => text.includes(w));
  const flag = leaks.length ? `  *** PLAINTEXT LEAK: ${leaks.join(", ")} ***` : "";
  console.log(
    `${dir} ${String(buf.length).padStart(6)} bytes  printable=${(ratio * 100).toFixed(0)}%${flag}`,
  );
  console.log(`   ${buf.subarray(0, 64).toString("hex")}`);
  if (leaks.length) process.exitCode = 1;
};

const wss = new WebSocketServer({ port: PORT });
console.log(`inspecting relay on ws://0.0.0.0:${PORT}  ->  ${UPSTREAM}`);
console.log("watching for any of:", LOOK_FOR.join(", "));

wss.on("connection", (client, req) => {
  const url = new URL(req.url ?? "/", "ws://x");
  console.log(`\n-- client connected  ownerId=${url.searchParams.get("ownerId") ?? "(none)"}`);

  const upstream = new WebSocket(UPSTREAM + (req.url ?? ""));
  const pending = [];

  upstream.on("open", () => {
    for (const m of pending.splice(0)) upstream.send(m);
  });
  upstream.on("message", (d) => {
    dump("relay->app", d);
    if (client.readyState === WebSocket.OPEN) client.send(d);
  });
  upstream.on("close", () => client.close());
  upstream.on("error", (e) => console.log("upstream error:", e.message));

  client.on("message", (d) => {
    dump("app->relay", d);
    if (upstream.readyState === WebSocket.OPEN) upstream.send(d);
    else pending.push(d);
  });
  client.on("close", () => upstream.close());
  client.on("error", (e) => console.log("client error:", e.message));
});

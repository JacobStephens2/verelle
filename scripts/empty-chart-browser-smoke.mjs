// The app must launch straight into a usable Chart (story 41), and a day with
// no Observation must read as a gap rather than as a filled cell (story 20).
//
// This is the only automated check that boots the real app in a real WebView
// engine. The failure class it exists for is the one the Evolu spike found: a
// silent hang that presents as a permanent spinner with a clean console and
// surfaces no error anywhere. A unit test cannot see that; only a browser
// that waits for paint and gives up can.
//
// Modelled on Chart35's scripts/*-browser-smoke.mjs.
//
// Run with: npm run smoke:empty-chart
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";

import { installBrowserSmokeOwner } from "./browser-smoke-owner.mjs";

const PORT = 4193;
const origin = `http://127.0.0.1:${PORT}`;
const chromePath = process.env.VERELLE_CHROME_PATH || "/usr/bin/google-chrome";
// The frame is 42 cycle day columns wide - see CYCLE_DAY_COLUMNS in
// src/chart/projection.ts and the Clearblue 21–42 day range it comes from.
const EXPECTED_CYCLE_DAY_COLUMNS = 42;
// Long enough that a slow CI runner paints, short enough that a permanent
// spinner is reported as a failure rather than as a hung job.
const PAINT_TIMEOUT_MS = 10000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(proc) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (proc.exitCode !== null) throw new Error(`Vite exited with ${proc.exitCode}`);
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await sleep(100);
  }
  throw new Error("Timed out waiting for the Vite smoke server");
}

const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    String(PORT),
    "--strictPort",
  ],
  { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
);
let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk;
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk;
});

let browser;
const failures = [];
try {
  await waitForServer(server);
  browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await installBrowserSmokeOwner(page);

  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto(origin, { waitUntil: "domcontentloaded" });

  // 1. The Chart frame paints. Not a blank screen, and not a spinner that
  //    never resolves.
  try {
    await page.waitForSelector('[data-testid="chart-frame"]', { timeout: PAINT_TIMEOUT_MS });
    console.log("ok: chart frame painted");
  } catch {
    failures.push("The chart frame never painted");
  }

  // 2. The cycle is laid out as cycle day columns, numbered from 1.
  const columns = await page.$$eval('[data-testid="cycle-day-column"]', (cells) =>
    cells.map((cell) => cell.textContent?.trim()),
  );
  assert.equal(
    columns.length,
    EXPECTED_CYCLE_DAY_COLUMNS,
    `Expected ${EXPECTED_CYCLE_DAY_COLUMNS} cycle day columns, saw ${columns.length}`,
  );
  assert.equal(columns[0], "1");
  assert.equal(columns.at(-1), String(EXPECTED_CYCLE_DAY_COLUMNS));
  console.log(`ok: ${columns.length} cycle day columns, numbered 1..${columns.at(-1)}`);

  // 3. An explicit empty state, and cells that are visibly empty rather than
  //    filled with a guess.
  const emptyState = await page.$eval(
    '[data-testid="chart-empty-state"]',
    (element) => element.textContent?.trim() ?? "",
  );
  assert.ok(emptyState.length > 0, "The empty state carried no text");
  const filledCells = await page.$$eval('[data-testid="chart-cell"]', (cells) =>
    cells.filter((cell) => (cell.textContent ?? "").trim() !== "").length,
  );
  assert.equal(filledCells, 0, `${filledCells} cells were filled in an empty chart`);
  console.log(`ok: empty state reads ${JSON.stringify(emptyState)} over ${columns.length} empty cells`);

  // 4. Privacy and about is reachable from the Chart and states both halves of
  //    ADR 0012: the Relay operator cannot read Chart content, and does learn
  //    that a given owner synced, when, and roughly how much.
  await page.click('[data-testid="open-privacy"]');
  await page.waitForSelector('[data-testid="privacy-screen"]', { timeout: PAINT_TIMEOUT_MS });
  const privacyCopy = await page.$eval(
    '[data-testid="privacy-screen"]',
    (element) => element.textContent ?? "",
  );
  assert.ok(
    privacyCopy.includes("The Relay operator cannot read Chart content."),
    "Privacy and about omitted the content guarantee",
  );
  assert.ok(
    privacyCopy.includes(
      "The Relay operator does learn that a given owner synced, when, and roughly how much.",
    ),
    "Privacy and about omitted the metadata disclosure",
  );
  assert.ok(
    privacyCopy.includes(
      "The 24 Shared owner words you write down in Backup & restore are an offline record of the Shared owner secret.",
    ),
    "Privacy and about equated the Owner secret with the 24 Shared owner words",
  );
  assert.ok(
    privacyCopy.includes("If you lose these words, you lose the Chart."),
    "Privacy and about omitted the Owner-secret loss warning",
  );
  assert.ok(privacyCopy.includes("Nobody can restore it."), "Privacy and about omitted irreversibility");
  assert.match(privacyCopy, /no account/i);
  assert.match(privacyCopy, /no email/i);
  assert.match(privacyCopy, /no password/i);
  assert.ok(
    privacyCopy.includes("Verelle does not ask for a name or contact information."),
    "Privacy and about omitted the narrower no-contact fact",
  );
  assert.ok(
    !/handing your identity/i.test(privacyCopy),
    "Privacy and about overclaimed anonymity",
  );
  await page.click('[data-testid="close-privacy"]');
  await page.waitForSelector('[data-testid="chart-frame"]', { timeout: PAINT_TIMEOUT_MS });
  console.log("ok: Privacy and about is reachable and states what the Relay knows");

  // 5. Nothing failed quietly on the way there.
  if (consoleErrors.length > 0) {
    failures.push(`Console errors during launch: ${JSON.stringify(consoleErrors)}`);
  }
} catch (error) {
  console.error(serverOutput);
  throw error;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log("Empty chart smoke passed");

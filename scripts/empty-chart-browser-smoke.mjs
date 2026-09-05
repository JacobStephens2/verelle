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
const chromePath =
  process.env.VERELLE_CHROME_PATH ||
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "/usr/bin/google-chrome");
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

  // 3a. The Cycle label column stays pinned while the chart scrolls horizontally.
  const stickyStyles = await page.evaluate(() => {
    const scroller = document.querySelector(".chart-container");
    const headerTh = document.querySelector(".chart-header th:first-child");
    const rowTh = document.querySelector(".cycle-row th:first-child");
    if (!scroller || !headerTh || !rowTh) return null;
    const initialHeaderLeft = headerTh.getBoundingClientRect().left;
    const initialRowLeft = rowTh.getBoundingClientRect().left;
    scroller.scrollLeft = 250;
    const scrolledHeaderLeft = headerTh.getBoundingClientRect().left;
    const scrolledRowLeft = rowTh.getBoundingClientRect().left;
    scroller.scrollLeft = 0;
    return {
      headerSticky: window.getComputedStyle(headerTh).position === "sticky",
      rowSticky: window.getComputedStyle(rowTh).position === "sticky",
      pinnedHeader: Math.abs(initialHeaderLeft - scrolledHeaderLeft) < 2,
      pinnedRow: Math.abs(initialRowLeft - scrolledRowLeft) < 2,
    };
  });
  assert.ok(stickyStyles?.headerSticky, "The header Cycle column was not position: sticky");
  assert.ok(stickyStyles?.rowSticky, "The row Cycle column was not position: sticky");
  assert.ok(stickyStyles?.pinnedHeader, "The header Cycle column drifted when scrolled");
  assert.ok(stickyStyles?.pinnedRow, "The row Cycle column drifted when scrolled");
  console.log("ok: Cycle label column stays pinned while the Chart scrolls horizontally");

  // 3b. Three zoom levels are available and update the chart container zoom mode.
  await page.click('[data-testid="zoom-compact"]');
  const compactZoom = await page.$eval(".chart-container", (el) => el.getAttribute("data-zoom"));
  assert.equal(compactZoom, "compact", "Compact zoom mode did not set data-zoom='compact'");

  await page.click('[data-testid="zoom-trend"]');
  const trendZoom = await page.$eval(".chart-container", (el) => el.getAttribute("data-zoom"));
  assert.equal(trendZoom, "trend", "Trend zoom mode did not set data-zoom='trend'");

  await page.click('[data-testid="zoom-normal"]');
  const normalZoom = await page.$eval(".chart-container", (el) => el.getAttribute("data-zoom"));
  assert.equal(normalZoom, null, "Normal zoom mode left data-zoom set");
  console.log("ok: three zoom levels (normal, compact, trend) switch cleanly");

  // 3c. Calendar view is reachable, navigates months, and tapping a day opens day details.
  await page.click('[data-testid="view-calendar"]');
  await page.waitForSelector('[data-testid="calendar-view"]', { timeout: PAINT_TIMEOUT_MS });
  const initialMonth = await page.$eval(
    '[data-testid="calendar-month-title"]',
    (el) => el.textContent?.trim() ?? "",
  );
  assert.ok(initialMonth.length > 0, "Calendar month title was empty");

  // Navigate backward
  await page.click('[data-testid="calendar-prev"]');
  const prevMonth = await page.$eval(
    '[data-testid="calendar-month-title"]',
    (el) => el.textContent?.trim() ?? "",
  );
  assert.notEqual(initialMonth, prevMonth, "Month title did not change on previous click");

  // Navigate forward twice
  await page.click('[data-testid="calendar-next"]');
  await page.click('[data-testid="calendar-next"]');
  const nextMonth = await page.$eval(
    '[data-testid="calendar-month-title"]',
    (el) => el.textContent?.trim() ?? "",
  );
  assert.notEqual(initialMonth, nextMonth, "Month title did not change on next click");

  // Go to Today
  await page.click('[data-testid="calendar-today-btn"]');
  const resetMonth = await page.$eval(
    '[data-testid="calendar-month-title"]',
    (el) => el.textContent?.trim() ?? "",
  );
  assert.equal(resetMonth, initialMonth, "Go to Today did not reset month");

  // Tapping a day opens observation details (the same day details the Chart opens)
  await page.click('[data-testid="calendar-day"]');
  const observationTitle = await page.$eval(
    '[data-testid="record-title"]',
    (el) => el.textContent?.trim() ?? "",
  );
  assert.equal(observationTitle, "Observation details", "Tapping a calendar day did not open Observation details");

  // Switch back to Chart
  await page.click('[data-testid="view-chart"]');
  await page.waitForSelector('[data-testid="chart-frame"]', { timeout: PAINT_TIMEOUT_MS });
  console.log("ok: Calendar view navigates months, opens day details on tap, and switches back to Chart");

  // 3d. Insights view is reachable, displays stats and export options, and switches back to Chart.
  await page.click('[data-testid="view-insights"]');
  await page.waitForSelector('[data-testid="insights-view"]', { timeout: PAINT_TIMEOUT_MS });
  const hasStats = await page.$eval(
    '[data-testid="cycle-stats"]',
    (el) => (el.textContent?.trim().length ?? 0) > 0,
  );
  assert.ok(hasStats, "Insights view did not render cycle stats");
  const hasExport = await page.$eval(
    '[data-testid="export-section"]',
    (el) => (el.textContent?.trim().length ?? 0) > 0,
  );
  assert.ok(hasExport, "Insights view did not render export section");

  // Switch back to Chart
  await page.click('[data-testid="view-chart"]');
  await page.waitForSelector('[data-testid="chart-frame"]', { timeout: PAINT_TIMEOUT_MS });
  console.log("ok: Insights view is reachable, displays stats and export options, and switches back to Chart");

  // 3e. Method Guide is reachable, displays sources and monitor coaching, and switches back to Chart.
  await page.click('[data-testid="open-guide"]');
  await page.waitForSelector('[data-testid="method-guide"]', { timeout: PAINT_TIMEOUT_MS });
  const hasSources = await page.$eval(
    '[data-testid="method-sources"]',
    (el) => (el.textContent?.trim().length ?? 0) > 0,
  );
  assert.ok(hasSources, "Method Guide did not render published sources");
  const hasCoaching = await page.$eval(
    '[data-testid="monitor-setup-coaching"]',
    (el) => (el.textContent?.trim().length ?? 0) > 0,
  );
  assert.ok(hasCoaching, "Method Guide did not render monitor setup coaching");

  // Switch back to Chart
  await page.click('[data-testid="guide-back"]');
  await page.waitForSelector('[data-testid="chart-frame"]', { timeout: PAINT_TIMEOUT_MS });
  console.log("ok: Method Guide is reachable, displays sources and monitor coaching, and switches back to Chart");

  const pairingState = await page.$eval(
    '[data-testid="pairing-state"]',
    (element) => element.textContent?.trim() ?? "",
  );
  assert.equal(
    pairingState,
    "This Chart is only on this phone",
    "An unpaired phone did not say the Chart is only on this phone",
  );
  console.log("ok: unpaired Chart state is visible");

  // 4. Pairing is reachable from the Chart and still states that the Chart is
  //    not yet shared.
  await page.click('[data-testid="open-pairing"]');
  await page.waitForSelector('[data-testid="pairing-screen"]', { timeout: PAINT_TIMEOUT_MS });
  const pairingCopy = await page.$eval(
    '[data-testid="pairing-screen"]',
    (element) => element.textContent ?? "",
  );
  assert.ok(
    pairingCopy.includes("never reaches the Relay"),
    "Pairing omitted that the code never reaches the Relay",
  );
  assert.ok(
    pairingCopy.includes("Show a pairing code"),
    "Pairing omitted the show-code action",
  );
  await page.click('[data-testid="close-pairing"]');
  await page.waitForSelector('[data-testid="chart-frame"]', { timeout: PAINT_TIMEOUT_MS });
  console.log("ok: Pairing is reachable from the Chart");

  // 5. Privacy and about is reachable from the Chart and states both halves of
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

  // 6. Nothing failed quietly on the way there.
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

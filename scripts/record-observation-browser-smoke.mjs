// The walking skeleton, checked end to end in a real WebView engine: the app
// opens on today, the four mandatory fields are settable without scrolling,
// a save is confirmed, the Monitor reading and User-marked Peak land in
// today's Chart cell, and both marking and un-marking survive a reload.
//
// The failure class this exists for is the one the Evolu spike found: a silent
// hang that presents as a permanent spinner with a clean console and surfaces
// no error anywhere. A unit test cannot see that; only a browser that waits
// for paint and gives up can.
//
// Modelled on Chart35's scripts/*-browser-smoke.mjs.
//
// Run with: npm run smoke:record-observation
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";

const PORT = 4194;
const origin = `http://127.0.0.1:${PORT}`;
const chromePath = process.env.VERELLE_CHROME_PATH || "/usr/bin/google-chrome";
// A typical phone. The four mandatory fields have to be settable inside this
// box without scrolling.
const VIEWPORT = { width: 390, height: 844 };
// Long enough that a slow CI runner opens SQLite over OPFS, short enough that a
// permanent spinner is reported as a failure rather than as a hung job.
const PAINT_TIMEOUT_MS = 20000;

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

const failures = [];
const fail = (message) => failures.push(message);

/** The civil date the browser is on, which is the day the app opens to. */
const todayInBrowser = (page) =>
  page.evaluate(() =>
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  );

const todaysCellSelector = (today) =>
  `[data-testid="chart-cell"][data-civil-date="${today}"]`;

const recordDateSelector = '[data-testid="record-date-input"]';

const civilDatePlusDays = (date, days) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

const setRecordDate = (page, date) =>
  page.$eval(
    recordDateSelector,
    (input, nextDate) => {
      if (!(input instanceof HTMLInputElement)) return;
      input.value = nextDate;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    date,
  );

const waitForRecordDate = (page, date) =>
  page.waitForFunction(
    (selector, expectedDate) => {
      const input = document.querySelector(selector);
      return input instanceof HTMLInputElement && input.value === expectedDate;
    },
    { timeout: PAINT_TIMEOUT_MS },
    recordDateSelector,
    date,
  );

const readTodaysCell = (page, today) =>
  page.$eval(todaysCellSelector(today), (cell) => ({
    monitorReading:
      cell.querySelector('[data-testid="monitor-reading"]')?.textContent?.trim() ?? "",
    peakAnnotations: [...cell.querySelectorAll('[data-testid="peak-annotation"]')].map(
      (annotation) => annotation.textContent?.trim() ?? "",
    ),
  }));

const waitForTodaysMarkedPeak = (page, today) =>
  page.waitForFunction(
    (date) => {
      const cell = document.querySelector(
        `[data-testid="chart-cell"][data-civil-date="${date}"]`,
      );
      return (
        cell
          ?.querySelector('[data-testid="monitor-reading"]')
          ?.textContent?.trim() === "High" &&
        cell
          ?.querySelector('[data-testid="peak-annotation"]')
          ?.textContent?.trim() === "P"
      );
    },
    { timeout: PAINT_TIMEOUT_MS },
    today,
  );

let browser;
try {
  await waitForServer(server);
  browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto(origin, { waitUntil: "domcontentloaded" });

  // 1. The app opens on today, with no navigation.
  await page.waitForSelector('[data-testid="record-observation"]', {
    timeout: PAINT_TIMEOUT_MS,
  });
  const today = await todayInBrowser(page);
  assert.equal(
    await page.$eval(recordDateSelector, (input) =>
      input instanceof HTMLInputElement ? input.value : "",
    ),
    today,
    "The app did not open on today",
  );
  console.log(`ok: opened on ${today} with no navigation`);

  // A missed day is reachable directly from the recording screen, without
  // walking backward through one day at a time. Future dates are not valid
  // recording targets.
  const datePicker = await page.$eval('[data-testid="record-date-input"]', (input) => ({
    value: input instanceof HTMLInputElement ? input.value : "",
    max: input instanceof HTMLInputElement ? input.max : "",
  }));
  assert.deepEqual(datePicker, { value: today, max: today });
  console.log("ok: a past Civil date is directly reachable from today");

  const pastDate = civilDatePlusDays(today, -2);
  await setRecordDate(page, pastDate);
  await waitForRecordDate(page, pastDate);
  await page.select('[data-testid="lh-strip"]', "Positive");
  await page.select('[data-testid="mucus"]', "Stretchy");
  await page.type('[data-testid="temperature"]', "97.8");
  await page.type('[data-testid="note"]', "Copied from the paper Chart");
  await page.click('[data-testid="monitor-Low"]');
  await page.click('[data-testid="bleeding-Heavy"]');
  await page.click('[data-testid="save"]');
  await page.waitForFunction(
    (date) =>
      document
        .querySelector(`[data-testid="chart-cell"][data-civil-date="${date}"]`)
        ?.querySelector('[data-testid="monitor-reading"]')
        ?.textContent?.trim() === "Low",
    { timeout: PAINT_TIMEOUT_MS },
    pastDate,
  );
  console.log(`ok: recorded the missed day ${pastDate} directly from the date picker`);

  await setRecordDate(page, today);
  await waitForRecordDate(page, today);

  // 2. All four mandatory fields are settable inside a phone screen without
  //    scrolling, and the optional fields are not shown.
  const mandatory = [
    '[data-testid="monitor-High"]',
    '[data-testid="bleeding-None"]',
    '[data-testid="user-marked-peak"]',
    '[data-testid="intercourse"]',
    '[data-testid="save"]',
  ];
  for (const selector of mandatory) {
    const bottom = await page.$eval(selector, (el) => el.getBoundingClientRect().bottom);
    if (bottom > VIEWPORT.height) {
      fail(`${selector} sits ${Math.round(bottom)}px down, past a ${VIEWPORT.height}px screen`);
    }
  }
  const pageScrolls = await page.evaluate(
    () => document.documentElement.scrollHeight > window.innerHeight,
  );
  for (const selector of ['[data-testid="lh-strip"]', '[data-testid="mucus"]', '[data-testid="temperature"]', '[data-testid="note"]']) {
    if ((await page.$(selector)) !== null) fail(`${selector} was shown before "more" was opened`);
  }
  console.log(
    `ok: four mandatory fields and Save fit a ${VIEWPORT.width}x${VIEWPORT.height} screen; optional fields hidden` +
      (pageScrolls ? " (the Chart below scrolls, the fields do not)" : ""),
  );

  // 3. The "more" affordance reveals the optional fields.
  await page.click('[data-testid="toggle-more"]');
  await page.waitForSelector('[data-testid="note"]', { timeout: PAINT_TIMEOUT_MS });
  await page.click('[data-testid="toggle-more"]');
  console.log("ok: optional fields are reachable behind the more affordance");

  // 4. Record the four mandatory fields and save.
  await page.click('[data-testid="monitor-High"]');
  await page.click('[data-testid="bleeding-Heavy"]');
  await page.click('[data-testid="user-marked-peak"]');
  await page.click('[data-testid="intercourse"]');
  await page.click('[data-testid="save"]');

  // 5. Nothing is disabled while the app is working, and a tap made in that
  //    moment is not dropped. v1 wired a global busy flag to `disabled` on
  //    about ten controls and silently swallowed clicks.
  const disabledDuringSave = await page.$$eval(
    "button[disabled], input[disabled], select[disabled], textarea[disabled]",
    (elements) => elements.length,
  );
  if (disabledDuringSave > 0) {
    fail(`${disabledDuringSave} controls were disabled while the save was in flight`);
  }
  await page.click('[data-testid="monitor-Peak"]');
  const tookTheTap = await page.$eval(
    '[data-testid="monitor-Peak"]',
    (el) => el.getAttribute("aria-pressed") === "true",
  );
  if (!tookTheTap) fail("A tap made while the save was in flight was dropped");
  await page.click('[data-testid="monitor-High"]');

  // 6. The save is visibly confirmed.
  await page.waitForSelector('[data-testid="save-confirmation"]', {
    timeout: PAINT_TIMEOUT_MS,
  });
  const confirmation = await page.$eval(
    '[data-testid="save-confirmation"]',
    (el) => el.textContent?.trim() ?? "",
  );
  assert.ok(confirmation.length > 0, "The save confirmation carried no text");
  console.log(`ok: save confirmed with ${JSON.stringify(confirmation)}, no control disabled`);

  // 7. The recorded Monitor reading and the User-marked Peak are in today's
  //    cell. The monitor's text and the mechanical annotation stay separate.
  await waitForTodaysMarkedPeak(page, today);
  console.log("ok: today's Chart cell shows the recorded Monitor reading and P");

  // 8. A Chart day is the navigation into its complete Observation. The
  //    compact cell can omit fields; the detail view may not.
  await page.click(
    `[data-testid="chart-day"][data-civil-date="${pastDate}"]`,
  );
  await waitForRecordDate(page, pastDate);
  assert.equal(
    await page.$eval('[data-testid="record-observation"]', (element) =>
      element.getAttribute("aria-label"),
    ),
    "Observation details",
  );
  assert.equal(
    await page.$eval('[data-testid="record-title"]', (element) =>
      element.textContent?.trim(),
    ),
    "Observation details",
  );
  for (const selector of [
    '[data-testid="lh-strip"]',
    '[data-testid="mucus"]',
    '[data-testid="temperature"]',
    '[data-testid="note"]',
  ]) {
    assert.notEqual(await page.$(selector), null, `${selector} was hidden in day details`);
  }
  assert.equal(
    await page.$eval(
      '[data-testid="monitor-Low"]',
      (element) => element.getAttribute("aria-pressed"),
    ),
    "true",
  );
  assert.equal(
    await page.$eval(
      '[data-testid="bleeding-Heavy"]',
      (element) => element.getAttribute("aria-pressed"),
    ),
    "true",
  );
  assert.equal(await page.$eval('[data-testid="lh-strip"]', (element) => element.value), "Positive");
  assert.equal(await page.$eval('[data-testid="mucus"]', (element) => element.value), "Stretchy");
  assert.equal(await page.$eval('[data-testid="temperature"]', (element) => element.value), "97.8");
  assert.equal(
    await page.$eval('[data-testid="temperature-unit"]', (element) => element.value),
    "F",
  );
  assert.equal(
    await page.$eval('[data-testid="note"]', (element) => element.value),
    "Copied from the paper Chart",
  );
  console.log(`ok: tapping ${pastDate} opens every field recorded for it`);

  // Editing the Observation writes the same Civil date and repaints its
  // compact Chart cell rather than creating a second row.
  await page.click('[data-testid="monitor-Error"]');
  await page.$eval('[data-testid="note"]', (element) => {
    if (!(element instanceof HTMLTextAreaElement)) return;
    element.value = "Corrected against the paper Chart";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.click('[data-testid="save"]');
  await page.waitForFunction(
    (date) =>
      document
        .querySelector(`[data-testid="chart-cell"][data-civil-date="${date}"]`)
        ?.querySelector('[data-testid="monitor-reading"]')
        ?.textContent?.trim() === "Error",
    { timeout: PAINT_TIMEOUT_MS },
    pastDate,
  );
  console.log(`ok: editing ${pastDate} updates its existing Chart day`);

  // The date between the two recorded days is a real Cycle Day with no
  // Observation. It opens the same complete editor, blank and ready to save.
  const missedDate = civilDatePlusDays(today, -1);
  await page.click(
    `[data-testid="chart-day"][data-civil-date="${missedDate}"]`,
  );
  await waitForRecordDate(page, missedDate);
  const blankDetails = await page.evaluate(() => ({
    pressedChoices: [
      ...document.querySelectorAll(
        '[data-testid^="monitor-"][aria-pressed="true"], [data-testid^="bleeding-"][aria-pressed="true"]',
      ),
    ].length,
    markedPeak:
      document.querySelector('[data-testid="user-marked-peak"]') instanceof
        HTMLInputElement &&
      document.querySelector('[data-testid="user-marked-peak"]').checked,
    intercourse:
      document.querySelector('[data-testid="intercourse"]') instanceof HTMLInputElement &&
      document.querySelector('[data-testid="intercourse"]').checked,
    lhStrip: document.querySelector('[data-testid="lh-strip"]')?.value,
    mucus: document.querySelector('[data-testid="mucus"]')?.value,
    temperature: document.querySelector('[data-testid="temperature"]')?.value,
    note: document.querySelector('[data-testid="note"]')?.value,
  }));
  assert.deepEqual(blankDetails, {
    pressedChoices: 0,
    markedPeak: false,
    intercourse: false,
    lhStrip: "Not recorded",
    mucus: "Not recorded",
    temperature: "",
    note: "",
  });
  await page.click('[data-testid="monitor-Missed"]');
  await page.click('[data-testid="save"]');
  await page.waitForFunction(
    (date) =>
      document
        .querySelector(`[data-testid="chart-cell"][data-civil-date="${date}"]`)
        ?.querySelector('[data-testid="monitor-reading"]')
        ?.textContent?.trim() === "Missed",
    { timeout: PAINT_TIMEOUT_MS },
    missedDate,
  );
  console.log(`ok: unrecorded ${missedDate} opens blank and records in place`);

  // 9. The Owner secret reaches no web-storage surface (ADR 0013).
  const webStorage = await page.evaluate(async () => ({
    localStorage: Object.keys(localStorage),
    sessionStorage: Object.keys(sessionStorage),
    indexedDb: (await indexedDB.databases()).map((db) => db.name),
  }));
  for (const [surface, keys] of Object.entries(webStorage)) {
    if (keys.length > 0) fail(`${surface} holds ${JSON.stringify(keys)}; it must hold nothing`);
  }
  console.log("ok: localStorage, sessionStorage and IndexedDB are all empty");

  // 10. A reload is the browser's cold relaunch: the Observation is still there.
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForTodaysMarkedPeak(page, today);
  const stillPressed = await page.$eval(
    '[data-testid="monitor-High"]',
    (el) => el.getAttribute("aria-pressed") === "true",
  );
  if (!stillPressed) fail("The recording screen did not come back showing what was recorded");
  console.log(
    `ok: after a reload, today's cell still reads ${JSON.stringify(await readTodaysCell(page, today))}`,
  );

  // 11. Un-marking the same date removes P and stays removed after a reload.
  await page.click('[data-testid="user-marked-peak"]');
  await page.click('[data-testid="save"]');
  await page.waitForFunction(
    (date) =>
      document
        .querySelector(`[data-testid="chart-cell"][data-civil-date="${date}"]`)
        ?.querySelector('[data-testid="peak-annotation"]') === null,
    { timeout: PAINT_TIMEOUT_MS },
    today,
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(todaysCellSelector(today), { timeout: PAINT_TIMEOUT_MS });
  const afterUnmark = await readTodaysCell(page, today);
  assert.deepEqual(afterUnmark.peakAnnotations, [], "P returned after the date was un-marked");
  const markStayedCleared = await page.$eval(
    '[data-testid="user-marked-peak"]',
    (element) => element instanceof HTMLInputElement && !element.checked,
  );
  if (!markStayedCleared) fail("The recording screen did not preserve the un-marked Peak");
  console.log("ok: un-marking removes P and the cleared mark survives a reload");

  // 12. Nothing failed quietly on the way there.
  if (consoleErrors.length > 0) {
    fail(`Console errors during the run: ${JSON.stringify(consoleErrors)}`);
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
console.log("Record observation smoke passed");

import type { Observation, MonitorReading } from "../observations/observation";
import { mucusCategory } from "../observations/observation";
import type { Profile } from "../observations/profile";
import type { Chart } from "./projection";
import type { CivilDate } from "./civil-date";
import { computeCycleStats } from "./cycle-stats";

export interface FormattedDayRow {
  readonly cycleLabel: string;
  readonly cycleDayLabel: string;
  readonly civilDate: CivilDate;
  readonly monitorReading: string;
  readonly bleeding: string;
  readonly mucusDescription: string;
  readonly mucusCategory: string;
  readonly lhStrip: string;
  readonly temperatureFormatted: string;
  readonly intercourse: string;
  readonly peakAnnotations: string;
  readonly dayStatus: string;
  readonly note: string;
}

function formatObservationDetails(
  civilDate: CivilDate,
  cycleLabel: string,
  cycleDayLabel: string,
  obs: Observation | undefined,
  fallbackReading: MonitorReading | null = null,
  annotations: readonly string[] = [],
  dayStatus: string | null = null,
): FormattedDayRow {
  const mCategory = mucusCategory(obs?.mucus ?? null);
  const temperatureFormatted =
    obs?.temperature != null
      ? `${obs.temperature}°${obs.temperatureUnit ?? ""}`
      : "";
  const intercourse =
    obs?.intercourse === true ? "Yes" : obs?.intercourse === false ? "No" : "";

  return {
    cycleLabel,
    cycleDayLabel,
    civilDate,
    monitorReading: obs?.monitorReading ?? fallbackReading ?? "",
    bleeding: obs?.bleeding ?? "",
    mucusDescription: obs?.mucus ?? "",
    mucusCategory: mCategory ?? "",
    lhStrip: obs?.lhStrip ?? "",
    temperatureFormatted,
    intercourse,
    peakAnnotations: annotations.join(" "),
    dayStatus: dayStatus ?? "",
    note: obs?.note ?? "",
  };
}

function escapeCsv(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function escapeHtml(text: string | number | null | undefined): string {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Format the recorded chart data as standard CSV suitable for spreadsheets,
 * doctors, and Marquette instructors.
 */
export function formatChartCsv(
  chart: Chart,
  observations: readonly Observation[],
): string {
  const obsMap = new Map<CivilDate, Observation>();
  for (const obs of observations) {
    obsMap.set(obs.civilDate, obs);
  }

  const rows: string[][] = [
    [
      "Cycle",
      "Cycle Day",
      "Civil Date",
      "Monitor Reading",
      "Bleeding",
      "Mucus Description",
      "Mucus Category",
      "LH Strip",
      "Temperature",
      "Intercourse",
      "Peak Annotation",
      "Day Status",
      "Notes",
    ],
  ];

  // Include observations recorded prior to Cycle 1
  for (const unassigned of chart.unassignedDays) {
    const obs = obsMap.get(unassigned.civilDate);
    const row = formatObservationDetails(
      unassigned.civilDate,
      "Unassigned",
      "—",
      obs,
      unassigned.monitorReading,
    );
    rows.push([
      row.cycleLabel,
      row.cycleDayLabel,
      row.civilDate,
      row.monitorReading,
      row.bleeding,
      row.mucusDescription,
      row.mucusCategory,
      row.lhStrip,
      row.temperatureFormatted,
      row.intercourse,
      row.peakAnnotations,
      row.dayStatus,
      row.note,
    ]);
  }

  for (let cycleIdx = 0; cycleIdx < chart.cycles.length; cycleIdx++) {
    const cycle = chart.cycles[cycleIdx]!;
    const cycleNumber = cycleIdx + 1;

    for (const day of cycle.days) {
      const obs = obsMap.get(day.civilDate);
      const row = formatObservationDetails(
        day.civilDate,
        String(cycleNumber),
        String(day.cycleDay),
        obs,
        day.monitorReading,
        day.annotations,
        day.dayStatus,
      );

      rows.push([
        row.cycleLabel,
        row.cycleDayLabel,
        row.civilDate,
        row.monitorReading,
        row.bleeding,
        row.mucusDescription,
        row.mucusCategory,
        row.lhStrip,
        row.temperatureFormatted,
        row.intercourse,
        row.peakAnnotations,
        row.dayStatus,
        row.note,
      ]);
    }
  }

  return rows.map((r) => r.map(escapeCsv).join(",")).join("\n");
}

function renderDayRowHtml(row: FormattedDayRow): string {
  const statusClass = row.dayStatus === "fertile" ? "status-fertile" : "status-infertile";
  return `
    <tr class="${statusClass}">
      <td class="num">${escapeHtml(row.cycleDayLabel)}</td>
      <td>${escapeHtml(row.civilDate)}</td>
      <td><span class="badge badge-${escapeHtml(row.monitorReading.toLowerCase())}">${escapeHtml(row.monitorReading || "—")}</span></td>
      <td>${escapeHtml(row.mucusDescription || "—")}${row.mucusCategory ? ` <small class="category">(${escapeHtml(row.mucusCategory)})</small>` : ""}</td>
      <td>${escapeHtml(row.bleeding || "—")}</td>
      <td>${escapeHtml(row.intercourse || "—")}</td>
      <td>${escapeHtml(row.temperatureFormatted || "—")}</td>
      <td>${escapeHtml(row.lhStrip || "—")}</td>
      <td><span class="status-badge">${escapeHtml(row.dayStatus || "—")}</span></td>
      <td>${escapeHtml(row.peakAnnotations || "—")}</td>
      <td class="notes-col">${escapeHtml(row.note)}</td>
    </tr>
  `;
}

/**
 * Format the recorded chart as a standalone, printable HTML document
 * tailored for handoff to a Marquette instructor or medical doctor.
 */
export function formatChartHtml(
  chart: Chart,
  observations: readonly Observation[],
  profile?: Profile | null,
): string {
  const obsMap = new Map<CivilDate, Observation>();
  for (const obs of observations) {
    obsMap.set(obs.civilDate, obs);
  }

  const stats = computeCycleStats(chart.cycles, chart.today);

  let unassignedHtml = "";
  if (chart.unassignedDays.length > 0) {
    let unassignedRowsHtml = "";
    for (const unassigned of chart.unassignedDays) {
      const obs = obsMap.get(unassigned.civilDate);
      const row = formatObservationDetails(
        unassigned.civilDate,
        "Unassigned",
        "—",
        obs,
        unassigned.monitorReading,
      );
      unassignedRowsHtml += renderDayRowHtml(row);
    }

    unassignedHtml = `
      <section class="cycle-section">
        <header class="cycle-header">
          <h3>Observations prior to Cycle 1</h3>
        </header>
        <div class="table-container">
          <table class="chart-table">
            <thead>
              <tr>
                <th>Cycle Day</th>
                <th>Civil Date</th>
                <th>Monitor Reading</th>
                <th>Mucus</th>
                <th>Bleeding</th>
                <th>Intercourse</th>
                <th>Temperature</th>
                <th>LH Strip</th>
                <th>Day Status</th>
                <th>Peak Count</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${unassignedRowsHtml}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  let cyclesHtml = "";
  for (let cycleIdx = 0; cycleIdx < chart.cycles.length; cycleIdx++) {
    const cycle = chart.cycles[cycleIdx]!;
    const cycleNumber = cycleIdx + 1;
    const inProgress = cycleIdx === chart.cycles.length - 1;

    let daysHtml = "";
    for (const day of cycle.days) {
      const obs = obsMap.get(day.civilDate);
      const row = formatObservationDetails(
        day.civilDate,
        String(cycleNumber),
        String(day.cycleDay),
        obs,
        day.monitorReading,
        day.annotations,
        day.dayStatus,
      );
      daysHtml += renderDayRowHtml(row);
    }

    cyclesHtml += `
      <section class="cycle-section">
        <header class="cycle-header">
          <h3>Cycle ${cycleNumber} ${inProgress ? "(In progress)" : ""}</h3>
          <p class="cycle-meta">
            Started: <strong>${cycle.startDate}</strong> |
            Days: <strong>${cycle.days.length}</strong>
            ${cycle.fertileWindow ? `| Fertile window: Cycle Days ${cycle.fertileWindow.start.cycleDay}–${cycle.fertileWindow.end?.cycleDay ?? "open"} (Rule: ${escapeHtml(cycle.fertileWindow.start.ruleId)})` : ""}
          </p>
        </header>
        <div class="table-container">
          <table class="chart-table">
            <thead>
              <tr>
                <th>Cycle Day</th>
                <th>Civil Date</th>
                <th>Monitor Reading</th>
                <th>Mucus</th>
                <th>Bleeding</th>
                <th>Intercourse</th>
                <th>Temperature</th>
                <th>LH Strip</th>
                <th>Day Status</th>
                <th>Peak Count</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${daysHtml}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  const profileSummaryHtml = profile
    ? `
      <section class="meta-card profile-summary">
        <h4>Profile information</h4>
        <div class="meta-grid">
          <div><span class="meta-label">Date of birth:</span> <strong>${escapeHtml(profile.dateOfBirth ?? "Not recorded")}</strong></div>
          <div><span class="meta-label">Breastfeeding:</span> <strong>${profile.breastfeeding === true ? "Yes" : profile.breastfeeding === false ? "No" : "Not recorded"}</strong></div>
          <div><span class="meta-label">Postpartum:</span> <strong>${profile.postpartum === true ? "Yes" : profile.postpartum === false ? "No" : "Not recorded"}</strong></div>
          <div><span class="meta-label">Perimenopause:</span> <strong>${profile.perimenopause === true ? "Yes" : profile.perimenopause === false ? "No" : "Not recorded"}</strong></div>
          ${profile.hormonalContraceptionStop ? `<div><span class="meta-label">Hormonal contraception stopped:</span> <strong>${escapeHtml(profile.hormonalContraceptionStop)}</strong></div>` : ""}
        </div>
      </section>
    `
    : "";

  const statsSummaryHtml = `
    <section class="meta-card stats-summary">
      <h4>Cycle Statistics Summary</h4>
      <div class="meta-grid">
        <div><span class="meta-label">Total recorded Cycles:</span> <strong>${stats.totalCycles}</strong></div>
        <div><span class="meta-label">Completed Cycles:</span> <strong>${stats.completedCyclesCount}</strong></div>
        <div><span class="meta-label">Average length:</span> <strong>${stats.averageDays !== null ? `${stats.averageDays} days` : "—"}</strong></div>
        <div><span class="meta-label">Shortest length:</span> <strong>${stats.shortestDays !== null ? `${stats.shortestDays} days` : "—"}</strong></div>
        <div><span class="meta-label">Longest length:</span> <strong>${stats.longestDays !== null ? `${stats.longestDays} days` : "—"}</strong></div>
        <div><span class="meta-label">Variation:</span> <strong>${stats.variationDays !== null ? `${stats.variationDays} days` : "—"}</strong></div>
      </div>
    </section>
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verelle Chart Export</title>
  <style>
    :root {
      --ink: #1c1a19;
      --ink-muted: #6b6560;
      --surface: #ffffff;
      --surface-subtle: #f9f8f6;
      --border: #e0dad1;
      --fertile-tint: #fbeee8;
      --fertile-text: #962a15;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.4;
      color: var(--ink);
      background: var(--surface);
    }
    body {
      margin: 0;
      padding: 1.5rem;
    }
    .header {
      border-bottom: 2px solid var(--border);
      padding-bottom: 1rem;
      margin-bottom: 1.5rem;
    }
    .title {
      margin: 0 0 0.25rem 0;
      font-size: 1.5rem;
      font-weight: 700;
    }
    .disclaimer {
      font-size: 0.8125rem;
      color: var(--ink-muted);
      margin: 0.5rem 0;
      line-height: 1.35;
    }
    .meta-card {
      background: var(--surface-subtle);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 1rem;
      margin-bottom: 1.25rem;
    }
    .meta-card h4 {
      margin: 0 0 0.5rem 0;
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--ink-muted);
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.5rem 1rem;
      font-size: 0.875rem;
    }
    .meta-label {
      color: var(--ink-muted);
    }
    .cycle-section {
      margin-bottom: 2rem;
      page-break-inside: avoid;
    }
    .cycle-header {
      margin-bottom: 0.5rem;
    }
    .cycle-header h3 {
      margin: 0 0 0.25rem 0;
      font-size: 1.125rem;
    }
    .cycle-meta {
      margin: 0;
      font-size: 0.8125rem;
      color: var(--ink-muted);
    }
    .table-container {
      overflow-x: auto;
    }
    .chart-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8125rem;
      text-align: left;
    }
    .chart-table th, .chart-table td {
      border: 1px solid var(--border);
      padding: 0.375rem 0.5rem;
    }
    .chart-table th {
      background: var(--surface-subtle);
      font-weight: 600;
    }
    .chart-table td.num {
      text-align: center;
      font-weight: 600;
    }
    .chart-table tr.status-fertile {
      background-color: var(--fertile-tint);
    }
    .badge {
      display: inline-block;
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .badge-peak { background: #fae8f0; color: #8b1353; }
    .badge-high { background: #f1ecfa; color: #58249c; }
    .badge-low { background: #edf2f7; color: #324b67; }
    .status-badge {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: capitalize;
    }
    .category {
      color: var(--ink-muted);
    }
    .notes-col {
      max-width: 250px;
      word-break: break-word;
    }
    @media print {
      body { padding: 0; }
      .meta-card { border: 1px solid #ccc; }
      .chart-table th, .chart-table td { border-color: #bbb; }
      @page { margin: 1cm; }
    }
  </style>
</head>
<body>
  <header class="header">
    <h1 class="title">Verelle Chart Export</h1>
    <p class="cycle-meta">Exported on ${escapeHtml(chart.today)}</p>
    <p class="disclaimer">
      Method disclaimer: For use with a certified Marquette instructor, not a medical device, and does not replace medical advice.
    </p>
  </header>

  ${statsSummaryHtml}
  ${profileSummaryHtml}

  <main>
    ${unassignedHtml}
    ${cyclesHtml}
  </main>
</body>
</html>`;
}

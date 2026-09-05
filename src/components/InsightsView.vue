<script setup lang="ts">
import { computed, ref } from "vue";
import type { CivilDate } from "../chart/civil-date";
import { displayCivilDate } from "../chart/civil-date";
import type { Chart } from "../chart/projection";
import type { Observation } from "../observations/observation";
import type { Profile } from "../observations/profile";
import { computeCycleStats } from "../chart/cycle-stats";
import { formatChartCsv, formatChartHtml } from "../chart/export-format";
import { shareOrDownloadFile } from "../chart/native-export";

const props = defineProps<{
  today: CivilDate;
  chart: Chart;
  observations?: readonly Observation[];
  profile?: Profile | null;
}>();

const stats = computed(() => computeCycleStats(props.chart.cycles, props.today));

const maxTrendLength = computed(() => {
  const lengths = stats.value.cycleTrend.map((t) => t.lengthDays);
  return Math.max(42, ...lengths);
});

const exportStatus = ref<string | null>(null);
let feedbackTimeout: ReturnType<typeof setTimeout> | undefined;

const runExport = async (
  filename: string,
  mimeType: string,
  content: string,
  successMessage: string,
) => {
  const res = await shareOrDownloadFile({
    filename,
    mimeType,
    content,
  });
  if (res.success) {
    if (feedbackTimeout) clearTimeout(feedbackTimeout);
    exportStatus.value = successMessage;
    feedbackTimeout = setTimeout(() => {
      exportStatus.value = null;
    }, 3000);
  }
};

const exportCsv = () =>
  runExport(
    `verelle-chart-${props.today}.csv`,
    "text/csv",
    formatChartCsv(props.chart, props.observations ?? []),
    "CSV exported",
  );

const exportHtml = () =>
  runExport(
    `verelle-chart-${props.today}.html`,
    "text/html",
    formatChartHtml(props.chart, props.observations ?? [], props.profile),
    "Printable Chart exported",
  );
</script>

<template>
  <section class="insights-view" data-testid="insights-view" aria-label="Insights &amp; Export">
    <div class="insights-container">
      <header class="insights-header">
        <h2>Insights</h2>
        <p class="insights-subtitle">
          Observed cycle patterns and lengths across recorded Cycles, without conclusions.
        </p>
      </header>

      <!-- Cycle Statistics -->
      <section class="insights-card" data-testid="cycle-stats" aria-label="Cycle statistics">
        <h3 class="card-title">Cycle Statistics</h3>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">Average length</span>
            <span class="stat-value">
              {{ stats.averageDays !== null ? `${stats.averageDays} days` : "—" }}
            </span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Shortest cycle</span>
            <span class="stat-value">
              {{ stats.shortestDays !== null ? `${stats.shortestDays} days` : "—" }}
            </span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Longest cycle</span>
            <span class="stat-value">
              {{ stats.longestDays !== null ? `${stats.longestDays} days` : "—" }}
            </span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Variation</span>
            <span class="stat-value">
              {{ stats.variationDays !== null ? `${stats.variationDays} days` : "—" }}
            </span>
          </div>
        </div>
        <p v-if="stats.completedCyclesCount < 2" class="stats-note">
          Variation is calculated when at least two completed Cycles have been recorded.
        </p>
      </section>

      <!-- Cycle Length Trend -->
      <section class="insights-card" data-testid="cycle-trend-list" aria-label="Cycle lengths">
        <h3 class="card-title">Cycle Lengths</h3>
        <div v-if="stats.cycleTrend.length === 0" class="empty-state">
          No cycles recorded yet.
        </div>
        <ul v-else class="trend-list">
          <li
            v-for="item in stats.cycleTrend"
            :key="item.cycleNumber"
            class="trend-item"
            :class="{ 'in-progress': item.inProgress }"
          >
            <div class="trend-info">
              <span class="trend-cycle">Cycle {{ item.cycleNumber }}</span>
              <span class="trend-dates">
                {{ displayCivilDate(item.startDate) }} – {{ displayCivilDate(item.endDate) }}
              </span>
            </div>
            <div class="trend-bar-wrapper">
              <div
                class="trend-bar"
                :style="{ width: `${Math.min(100, Math.max(8, (item.lengthDays / maxTrendLength) * 100))}%` }"
              />
            </div>
            <div class="trend-length">
              {{ item.lengthDays }} days
              <span v-if="item.inProgress" class="trend-current-tag">(in progress)</span>
            </div>
          </li>
        </ul>
      </section>

      <!-- Export for Instructor or Doctor -->
      <section class="insights-card" data-testid="export-section" aria-label="Export Chart">
        <h3 class="card-title">Export Chart</h3>
        <p class="export-desc">
          Export your Chart data in a readable form for your instructor or doctor.
        </p>
        <div class="export-actions">
          <button
            type="button"
            class="export-btn export-btn--primary"
            data-testid="export-html-btn"
            @click="exportHtml"
          >
            Export Printable Chart
          </button>
          <button
            type="button"
            class="export-btn"
            data-testid="export-csv-btn"
            @click="exportCsv"
          >
            Export as CSV
          </button>
        </div>
        <div v-if="exportStatus" class="export-feedback" role="status">
          {{ exportStatus }}
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.insights-view {
  padding: 1rem;
  max-width: 640px;
  margin: 0 auto;
}

.insights-header {
  margin-bottom: 1.25rem;
}

.insights-header h2 {
  margin: 0 0 0.25rem 0;
  font-size: 1.375rem;
  font-weight: 700;
  color: var(--verelle-ink);
}

.insights-subtitle {
  margin: 0;
  font-size: 0.875rem;
  color: var(--verelle-ink-muted);
}

.insights-card {
  background: var(--verelle-surface);
  border: 1px solid var(--verelle-rule);
  border-radius: 12px;
  padding: 1rem 1.25rem;
  margin-bottom: 1rem;
}

.card-title {
  margin: 0 0 0.875rem 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--verelle-ink);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem 1rem;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.stat-label {
  font-size: 0.75rem;
  color: var(--verelle-ink-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.stat-value {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--verelle-ink);
}

.stats-note {
  margin: 0.75rem 0 0 0;
  font-size: 0.75rem;
  color: var(--verelle-ink-muted);
}

.trend-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.trend-item {
  display: grid;
  grid-template-columns: 140px 1fr 100px;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.8125rem;
}

@media (max-width: 480px) {
  .trend-item {
    grid-template-columns: 1fr;
    gap: 0.25rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--verelle-rule);
  }
}

.trend-info {
  display: flex;
  flex-direction: column;
}

.trend-cycle {
  font-weight: 600;
  color: var(--verelle-ink);
}

.trend-dates {
  font-size: 0.75rem;
  color: var(--verelle-ink-muted);
}

.trend-bar-wrapper {
  background: var(--verelle-surface-sunken);
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
}

.trend-bar {
  background: var(--verelle-stamp-high, #754bb7);
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.trend-item.in-progress .trend-bar {
  background: var(--verelle-ink-muted);
  opacity: 0.6;
}

.trend-length {
  text-align: right;
  font-weight: 600;
  color: var(--verelle-ink);
}

.trend-current-tag {
  display: block;
  font-size: 0.6875rem;
  font-weight: normal;
  color: var(--verelle-ink-muted);
}

.empty-state {
  color: var(--verelle-ink-muted);
  font-size: 0.875rem;
  padding: 0.5rem 0;
}

.export-desc {
  margin: 0 0 1rem 0;
  font-size: 0.8125rem;
  color: var(--verelle-ink-muted);
}

.export-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.625rem;
}

.export-btn {
  padding: 0.5rem 1rem;
  border: 1px solid var(--verelle-rule);
  border-radius: 8px;
  background: var(--verelle-surface);
  color: var(--verelle-ink);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.export-btn--primary {
  background: var(--verelle-ink);
  color: var(--verelle-surface);
  border-color: var(--verelle-ink);
}

.export-feedback {
  margin-top: 0.75rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--verelle-stamp-peak, #b82b75);
}
</style>

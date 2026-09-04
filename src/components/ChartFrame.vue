<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from "vue";

import type { CivilDate } from "../chart/civil-date";
import { todayCivilDate } from "../chart/civil-date";
import type { ChartZoom } from "../chart/chart-presentation";
import { DEFAULT_CHART_ZOOM } from "../chart/chart-presentation";
import type { ChartDay, UnassignedChartDay } from "../chart/projection";
import { CYCLE_DAY_COLUMNS, projectChart } from "../chart/projection";
import type { MonitorReading, Observation } from "../observations/observation";
import type { PairingState } from "../owners/owner-secret-store";
import type { SyncState } from "../sync/sync-state";
import ChartCell from "./ChartCell.vue";
import ChartZoomControl from "./ChartZoom.vue";

const props = defineProps<{
  today?: CivilDate;
  observations?: readonly Observation[];
  syncState?: SyncState;
  pairingState?: PairingState;
}>();

const emit = defineEmits<{
  selectDate: [date: CivilDate];
}>();

const zoom = ref<ChartZoom>(DEFAULT_CHART_ZOOM);

const chart = computed(() =>
  projectChart(props.observations ?? [], props.today ?? todayCivilDate()),
);

const columnCount = computed(() =>
  Math.max(
    CYCLE_DAY_COLUMNS,
    ...chart.value.cycles.map((cycle) => cycle.days.length),
  ),
);

const cycleDays = computed(() =>
  Array.from({ length: columnCount.value }, (_, index) => index + 1),
);

interface ChartRow {
  readonly key: string;
  readonly type: string;
  readonly startDate?: CivilDate;
  readonly cells: readonly (ChartDay | null)[];
}

const rows = computed<readonly ChartRow[]>(() => {
  if (chart.value.cycles.length === 0) {
    return [
      {
        key: "empty-current-cycle",
        type: "Current Cycle",
        startDate: undefined,
        cells: Array.from({ length: columnCount.value }, () => null),
      },
    ];
  }

  return chart.value.cycles.map((cycle, index) => ({
    key: cycle.startDate,
    type: index === chart.value.cycles.length - 1 ? "Current" : "Previous",
    startDate: cycle.startDate,
    cells: Array.from(
      { length: columnCount.value },
      (_, dayIndex) => cycle.days[dayIndex] ?? null,
    ),
  }));
});

function monitorReadingText(
  day: { readonly monitorReading: MonitorReading | null } | null | undefined,
): string {
  return day?.monitorReading ?? "";
}

function unassignedChartDayLabel(day: UnassignedChartDay): string {
  const details = [day.civilDate];
  if (day.monitorReading !== null) {
    details.push(`Monitor reading ${day.monitorReading}`);
  }
  return details.join(", ");
}

const root = useTemplateRef<HTMLElement>("root");

// A launch breadcrumb, reporting the column count and the frame's laid-out
// width and position once mounted.
onMounted(() => {
  requestAnimationFrame(() => {
    const box = root.value?.getBoundingClientRect();
    console.info(
      `verelle: chart frame painted, ${columnCount.value} cycle day columns, ` +
        `${Math.round(box?.width ?? 0)}x${Math.round(box?.height ?? 0)} at y=${Math.round(box?.top ?? 0)}`,
    );
  });
});
</script>

<template>
  <section ref="root" class="chart" data-testid="chart-frame" aria-label="Chart">
    <header class="chart__header">
      <div class="chart__heading">
        <h1 class="chart__title">Chart</h1>
        <p class="chart__pairing-state" data-testid="pairing-state">
          {{
            pairingState === "shared"
              ? "Shared Chart"
              : "This Chart is only on this phone"
          }}
        </p>
      </div>
      <div class="chart__status">
        <p
          class="chart__sync-state"
          :class="{ 'chart__sync-state--pending': syncState === 'pending' }"
          role="status"
          aria-live="polite"
          data-testid="sync-state"
        >
          {{ syncState === "pending" ? "Pending changes" : "Synced" }}
        </p>
        <p class="chart__today" data-testid="chart-today">{{ chart.today }}</p>
      </div>
    </header>

    <!-- Zoom toolbar: Normal, Compact, Trend -->
    <ChartZoomControl v-model="zoom" />

    <!-- Chart Table Container (Chart35 layout, sticky cycle column, 3 zoom levels) -->
    <div
      class="chart-container"
      :data-zoom="zoom !== 'normal' ? zoom : undefined"
    >
      <table class="chart-table">
        <caption class="chart__caption">
          Cycles, by cycle day
        </caption>
        <thead>
          <tr class="chart-header">
            <th scope="col" class="chart__cycle-label">Cycle</th>
            <th
              v-for="cycleDay in cycleDays"
              :key="cycleDay"
              scope="col"
              class="chart__cycle-day"
              data-testid="cycle-day-column"
            >
              {{ cycleDay }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.key"
            class="cycle-row"
            data-testid="chart-cycle"
          >
            <th scope="row" class="chart__cycle-label">
              <div class="cycle-label">
                <span class="cycle-label-num">{{ row.type }}</span>
                <template v-if="row.startDate">
                  <span class="cycle-label-sep"> · </span>
                  <span class="cycle-label-date">{{ row.startDate }}</span>
                </template>
              </div>
            </th>
            <ChartCell
              v-for="(day, index) in row.cells"
              :key="index"
              :day="day"
              :is-today="day?.civilDate === chart.today"
              @select-date="emit('selectDate', $event)"
            />
          </tr>
        </tbody>
      </table>
    </div>

    <section
      v-if="chart.unassignedDays.length > 0"
      class="chart__unassigned"
      aria-labelledby="unassigned-title"
    >
      <h2 id="unassigned-title" class="chart__unassigned-title">
        Before Cycle Day 1
      </h2>
      <p class="chart__unassigned-copy">
        These Observations stay dated but are not assigned a Cycle Day until a
        first day of full flow is recorded.
      </p>
      <div class="chart__unassigned-days">
        <button
          v-for="day in chart.unassignedDays"
          :key="day.civilDate"
          type="button"
          class="chart__unassigned-day"
          :aria-label="unassignedChartDayLabel(day)"
          :data-civil-date="day.civilDate"
          data-testid="chart-cell"
          @click="emit('selectDate', day.civilDate)"
        >
          <time :datetime="day.civilDate">{{ day.civilDate }}</time>
          <span>{{ monitorReadingText(day) }}</span>
        </button>
      </div>
    </section>

    <p
      v-if="chart.cycles.length === 0 && chart.unassignedDays.length === 0"
      class="chart__empty"
      data-testid="chart-empty-state"
    >
      Nothing recorded yet. Observations will appear here, one column per cycle
      day.
    </p>
  </section>
</template>

<style scoped>
.chart {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
}

.chart__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}

.chart__heading {
  display: grid;
  gap: 0.15rem;
}

.chart__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.chart__pairing-state {
  margin: 0;
  color: var(--verelle-ink-muted);
  font-size: 0.8125rem;
}

.chart__today {
  margin: 0;
  color: var(--verelle-ink-muted);
  font-variant-numeric: tabular-nums;
}

.chart__status {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.chart__sync-state {
  margin: 0;
  color: var(--verelle-ink-muted);
  font-size: 0.8125rem;
}

.chart__sync-state--pending {
  font-weight: 600;
  color: var(--verelle-ink);
}

.chart__caption {
  padding: 0.5rem 0.75rem;
  text-align: left;
  color: var(--verelle-ink-muted);
  font-size: 0.8125rem;
}

.chart__empty {
  margin: 0;
  color: var(--verelle-ink-muted);
  max-width: 34ch;
}

.chart__unassigned {
  display: grid;
  gap: 0.5rem;
}

.chart__unassigned-title,
.chart__unassigned-copy {
  margin: 0;
}

.chart__unassigned-title {
  font-size: 0.875rem;
}

.chart__unassigned-copy {
  max-width: 52ch;
  color: var(--verelle-ink-muted);
  font-size: 0.8125rem;
}

.chart__unassigned-days {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
}

.chart__unassigned-day {
  display: grid;
  min-width: 7rem;
  min-height: 3rem;
  padding: 0.375rem;
  border: 1px solid var(--verelle-rule);
  border-radius: 6px;
  text-align: center;
  font-size: 0.75rem;
  background: var(--verelle-surface);
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.chart__unassigned-day time {
  color: var(--verelle-ink-muted);
}
</style>

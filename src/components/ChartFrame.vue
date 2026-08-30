<script setup lang="ts">
import { computed, onMounted, useTemplateRef } from "vue";

import type { CivilDate } from "../chart/civil-date";
import { todayCivilDate } from "../chart/civil-date";
import type { ChartDay } from "../chart/projection";
import { CYCLE_DAY_COLUMNS, projectChart } from "../chart/projection";
import type { Observation } from "../observations/observation";

const props = defineProps<{
  today?: CivilDate;
  observations?: readonly Observation[];
}>();

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
  readonly label: string;
  readonly cells: readonly (ChartDay | null)[];
}

const rows = computed<readonly ChartRow[]>(() => {
  if (chart.value.cycles.length === 0) {
    return [
      {
        key: "empty-current-cycle",
        label: "Current Cycle",
        cells: Array.from({ length: columnCount.value }, () => null),
      },
    ];
  }

  return chart.value.cycles.map((cycle, index) => ({
    key: cycle.startDate,
    label:
      index === chart.value.cycles.length - 1
        ? `Current · ${cycle.startDate}`
        : `Previous · ${cycle.startDate}`,
    cells: Array.from(
      { length: columnCount.value },
      (_, dayIndex) => cycle.days[dayIndex] ?? null,
    ),
  }));
});

const root = useTemplateRef<HTMLElement>("root");

// A launch breadcrumb, reporting the column count and the frame's laid-out
// size. Capacitor forwards it to the app's stdout, which is the only thing
// that can tell a WebView that painted the Chart from one that came up blank,
// and a blank WebView is the failure the native shells have to stay clear of.
// `.github/workflows/ci.yml` asserts on this line after launching the app on
// an iOS simulator. The rAF is so the numbers describe a laid-out frame rather
// than a mounted but unmeasured one.
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
      <h1 class="chart__title">Chart</h1>
      <p class="chart__today" data-testid="chart-today">{{ chart.today }}</p>
    </header>

    <div class="chart__scroller">
      <table class="chart__grid">
        <caption class="chart__caption">
          Cycles, by cycle day
        </caption>
        <thead>
          <tr>
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
            data-testid="chart-cycle"
          >
            <th scope="row" class="chart__cycle-label">{{ row.label }}</th>
            <td
              v-for="(day, index) in row.cells"
              :key="index"
              class="chart__cell"
              :class="{ 'chart__cell--today': day?.civilDate === chart.today }"
              :data-civil-date="day?.civilDate ?? undefined"
              data-testid="chart-cell"
            >
              <!-- The reading in full, never an initial. A `P` on the Chart
                   may only ever come from a User-marked Peak; a Monitor Peak
                   is data the device displayed and nothing more (CONTEXT.md,
                   ADR 0011). A day with no Observation stays blank, so a gap
                   in the record reads as a gap. -->
              {{ day?.observation?.monitorReading ?? "" }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <section
      v-if="chart.unassignedObservations.length > 0"
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
        <div
          v-for="observation in chart.unassignedObservations"
          :key="observation.civilDate"
          class="chart__unassigned-day"
          :data-civil-date="observation.civilDate"
          data-testid="chart-cell"
        >
          <time :datetime="observation.civilDate">{{ observation.civilDate }}</time>
          <span>{{ observation.monitorReading ?? "" }}</span>
        </div>
      </div>
    </section>

    <p
      v-if="chart.cycles.length === 0 && chart.unassignedObservations.length === 0"
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

.chart__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.chart__today {
  margin: 0;
  color: var(--verelle-ink-muted);
  font-variant-numeric: tabular-nums;
}

/* The frame is 42 cycle day columns wide; it scrolls sideways rather than
   compressing the columns until the numbers stop being readable. */
.chart__scroller {
  overflow-x: auto;
  border: 1px solid var(--verelle-rule);
  border-radius: 8px;
}

.chart__grid {
  border-collapse: collapse;
  table-layout: fixed;
}

.chart__caption {
  padding: 0.5rem 0.75rem;
  text-align: left;
  color: var(--verelle-ink-muted);
  font-size: 0.8125rem;
}

.chart__cycle-day,
.chart__cell {
  width: 4rem;
  min-width: 4rem;
  border: 1px solid var(--verelle-rule);
  text-align: center;
}

.chart__cycle-label {
  position: sticky;
  left: 0;
  z-index: 1;
  min-width: 9rem;
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--verelle-rule);
  text-align: left;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
  color: var(--verelle-ink-muted);
  background: var(--verelle-surface-sunken);
}

.chart__cycle-day {
  padding: 0.375rem 0;
  font-size: 0.75rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--verelle-ink-muted);
  background: var(--verelle-surface-sunken);
}

.chart__cell {
  height: 3rem;
  font-size: 0.75rem;
}

.chart__cell--today {
  background: var(--verelle-surface-sunken);
  font-weight: 600;
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
}

.chart__unassigned-day time {
  color: var(--verelle-ink-muted);
}
</style>

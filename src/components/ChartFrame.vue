<script setup lang="ts">
import { computed, onMounted, useTemplateRef } from "vue";

import { chartFrame } from "../chart/frame";
import type { CivilDate } from "../chart/civil-date";
import { todayCivilDate } from "../chart/civil-date";
import type { Observation } from "../observations/observation";

const props = defineProps<{
  today?: CivilDate;
  observations?: readonly Observation[];
}>();

const frame = computed(() =>
  chartFrame(props.today ?? todayCivilDate(), props.observations ?? []),
);

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
      `verelle: chart frame painted, ${frame.value.columns.length} cycle day columns, ` +
        `${Math.round(box?.width ?? 0)}x${Math.round(box?.height ?? 0)} at y=${Math.round(box?.top ?? 0)}`,
    );
  });
});
</script>

<template>
  <section ref="root" class="chart" data-testid="chart-frame" aria-label="Chart">
    <header class="chart__header">
      <h1 class="chart__title">Chart</h1>
      <p class="chart__today" data-testid="chart-today">{{ frame.today }}</p>
    </header>

    <div class="chart__scroller">
      <table class="chart__grid">
        <caption class="chart__caption">
          This cycle, by cycle day
        </caption>
        <thead>
          <tr>
            <th
              v-for="column in frame.columns"
              :key="column.cycleDay"
              scope="col"
              class="chart__cycle-day"
              data-testid="cycle-day-column"
            >
              {{ column.cycleDay }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td
              v-for="column in frame.columns"
              :key="column.cycleDay"
              class="chart__cell"
              :class="{ 'chart__cell--today': column.isToday }"
              :data-civil-date="column.civilDate ?? undefined"
              data-testid="chart-cell"
            >
              <!-- The reading in full, never an initial. A `P` on the Chart
                   may only ever come from a User-marked Peak; a Monitor Peak
                   is data the device displayed and nothing more (CONTEXT.md,
                   ADR 0011). A day with no Observation stays blank, so a gap
                   in the record reads as a gap. -->
              {{ column.observation?.monitorReading ?? "" }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="frame.isEmpty" class="chart__empty" data-testid="chart-empty-state">
      Nothing recorded yet. Observations will appear here, one column per cycle
      day.
    </p>
    <p
      v-else-if="!frame.isAnchoredToFullFlow"
      class="chart__empty"
      data-testid="chart-unanchored"
    >
      Cycle day 1 is not set yet. Record a day of full flow and the columns will
      count from it.
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
</style>

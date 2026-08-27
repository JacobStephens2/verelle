<script setup lang="ts">
import { computed, onMounted } from "vue";

import { chartFrame } from "../chart/frame";
import type { CivilDate } from "../chart/civil-date";
import { todayCivilDate } from "../chart/civil-date";

const props = defineProps<{ today?: CivilDate }>();

const frame = computed(() => chartFrame(props.today ?? todayCivilDate()));

// A launch breadcrumb. Capacitor forwards this to the platform log, which is
// the only thing that can tell a WebView that painted the Chart from one that
// came up blank - and a blank WebView is the failure the native shells have to
// stay clear of. `.github/workflows/ci.yml` asserts on this line after
// launching the app on an iOS simulator.
onMounted(() => {
  console.info(`verelle: chart frame painted, ${frame.value.columns.length} cycle day columns`);
});
</script>

<template>
  <section class="chart" data-testid="chart-frame" aria-label="Chart">
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
              data-testid="chart-cell"
            ></td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="frame.isEmpty" class="chart__empty" data-testid="chart-empty-state">
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
  width: 2.25rem;
  min-width: 2.25rem;
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
}

.chart__empty {
  margin: 0;
  color: var(--verelle-ink-muted);
  max-width: 34ch;
}
</style>

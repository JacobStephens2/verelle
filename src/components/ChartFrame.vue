<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from "vue";

import type { CivilDate } from "../chart/civil-date";
import { todayCivilDate } from "../chart/civil-date";
import type { ChartZoom } from "../chart/chart-presentation";
import {
  DEFAULT_CHART_ZOOM,
  fertileBandPresentation,
  isAchievingHighlight,
} from "../chart/chart-presentation";
import type {
  ChartDay,
  FertileWindow,
  MucusPeak,
  UnassignedChartDay,
} from "../chart/projection";

import { CYCLE_DAY_COLUMNS, projectChart } from "../chart/projection";
import type { CycleOverlay, Intention } from "../observations/cycle-overlay";
import { resolvedCycleIntention } from "../observations/cycle-overlay";
import type { Profile } from "../observations/profile";
import type { MonitorReading, Observation } from "../observations/observation";
import type { PairingState } from "../owners/owner-secret-store";
import type { SyncState } from "../sync/sync-state";
import ChartCell from "./ChartCell.vue";
import ChartZoomControl from "./ChartZoom.vue";
import EligibilityWarnings from "./EligibilityWarnings.vue";

const props = defineProps<{
  today?: CivilDate;
  observations?: readonly Observation[];
  cycleOverlays?: readonly CycleOverlay[];
  profile?: Profile;
  syncState?: SyncState;
  pairingState?: PairingState;
  protocolOfferSkipped?: boolean;
}>();

const emit = defineEmits<{
  selectDate: [date: CivilDate];
  openCycleOverlay: [startDate: CivilDate];
  skipProtocolOffer: [];
}>();

const zoom = ref<ChartZoom>(DEFAULT_CHART_ZOOM);

const chart = computed(() =>
  projectChart(
    props.observations ?? [],
    props.today ?? todayCivilDate(),
    props.cycleOverlays ?? [],
    props.profile ?? null,
  ),
);

const localProtocolOfferSkipped = ref(false);

const firstCycle = computed(() => chart.value.cycles[0]);
const firstCycleOverlay = computed(() => {
  const cycle = firstCycle.value;
  if (!cycle || !props.cycleOverlays) return undefined;
  return props.cycleOverlays.find((overlay) => overlay.startDate === cycle.startDate);
});

const isProtocolOfferSkipped = computed(
  () => props.protocolOfferSkipped ?? localProtocolOfferSkipped.value,
);

const showProtocolOffer = computed(() => {
  if (!firstCycle.value) return false;
  const protocolFamily = firstCycleOverlay.value?.protocolFamily;
  return (
    (protocolFamily === null || protocolFamily === undefined) &&
    !isProtocolOfferSkipped.value
  );
});

const skipProtocolOffer = () => {
  localProtocolOfferSkipped.value = true;
  emit("skipProtocolOffer");
};

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
  readonly fertileWindow: FertileWindow | null;
  readonly mucusPeak: MucusPeak | null;
  readonly intention: Intention;
  readonly cycleLength: number;
  readonly cells: readonly (ChartDay | null)[];
}

const rows = computed<readonly ChartRow[]>(() => {
  if (chart.value.cycles.length === 0) {
    return [
      {
        key: "empty-current-cycle",
        type: "Current Cycle",
        startDate: undefined,
        fertileWindow: null,
        mucusPeak: null,
        intention: "avoid",
        cycleLength: 0,
        cells: Array.from({ length: columnCount.value }, () => null),
      },
    ];
  }

  return chart.value.cycles.map((cycle, index) => {
    const overlay = props.cycleOverlays?.find((o) => o.startDate === cycle.startDate);
    const intention = resolvedCycleIntention(overlay);
    return {
      key: cycle.startDate,
      type: index === chart.value.cycles.length - 1 ? "Current" : "Previous",
      startDate: cycle.startDate,
      fertileWindow: cycle.fertileWindow,
      mucusPeak: cycle.mucusPeak,
      intention,
      cycleLength: cycle.days.length,
      cells: Array.from(
        { length: columnCount.value },
        (_, dayIndex) => cycle.days[dayIndex] ?? null,
      ),
    };
  });
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

    <!-- Method disclaimer (shown once at start, not repeated per day) -->
    <aside
      class="chart__disclaimer"
      aria-label="Method disclaimer"
      data-testid="disclaimer"
    >
      <div class="chart__disclaimer-content">
        <h2 class="chart__disclaimer-title">Method disclaimer</h2>
        <p class="chart__disclaimer-text">
          Verelle records observations and computes the fertile window of the
          published Marquette Method protocol chosen for each cycle. It is a
          charting tool designed for use alongside a certified Marquette
          instructor, not a medical device, and does not replace medical advice
          or individualized instruction.
        </p>
      </div>
    </aside>

    <!-- Protocol family offer at first Cycle Day 1 (skippable) -->
    <aside
      v-if="showProtocolOffer"
      class="chart__protocol-offer"
      aria-label="Protocol family offer"
      data-testid="protocol-family-offer"
    >
      <div class="chart__protocol-offer-content">
        <h2 class="chart__protocol-offer-title">Choose a Protocol family</h2>
        <p class="chart__protocol-offer-text">
          Your first Cycle Day 1 is recorded. Verelle computes the fertile window
          once you select a Marquette protocol family. You can choose a protocol family
          now, or skip and chart without one.
        </p>
      </div>
      <div class="chart__protocol-offer-actions">
        <button
          type="button"
          class="chart__protocol-offer-choose"
          data-testid="offer-choose-protocol"
          @click="firstCycle && emit('openCycleOverlay', firstCycle.startDate)"
        >
          Choose a Protocol family
        </button>
        <button
          type="button"
          class="chart__protocol-offer-skip"
          data-testid="offer-skip-protocol"
          @click="skipProtocolOffer"
        >
          Skip
        </button>
      </div>
    </aside>

    <!-- Zoom toolbar: Normal, Compact, Trend -->
    <ChartZoomControl v-model="zoom" />

    <!-- Eligibility warnings -->
    <EligibilityWarnings :warnings="chart.eligibilityWarnings" />

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
            :class="{
              'cycle-row--has-fertile-window': row.fertileWindow !== null,
              'cycle-row--achieve': row.intention === 'achieve',
              'cycle-row--avoid': row.intention === 'avoid',
            }"
            :data-intention="row.intention"
            :data-has-fertile-window="row.fertileWindow !== null ? 'true' : undefined"
            :data-fertile-start="row.fertileWindow?.start.cycleDay"
            :data-fertile-end="row.fertileWindow ? (row.fertileWindow.end ? row.fertileWindow.end.cycleDay : 'open') : undefined"
            :data-fertile-start-confidence="row.fertileWindow?.start.confidence"
            :data-fertile-end-confidence="row.fertileWindow ? (row.fertileWindow.end ? row.fertileWindow.end.confidence : 'provisional') : undefined"
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
              :band="fertileBandPresentation(index + 1, row.fertileWindow, row.cycleLength)"
              :highlight="isAchievingHighlight(day ?? undefined, row.intention, row.mucusPeak)"
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

.chart__disclaimer {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  padding: 0.875rem 1rem;
  border: 1px solid var(--verelle-rule);
  border-radius: 8px;
  background: var(--verelle-surface);
}

.chart__disclaimer-content {
  flex: 1;
}

.chart__disclaimer-title {
  margin: 0 0 0.25rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--verelle-ink);
}

.chart__disclaimer-text {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.4;
  color: var(--verelle-ink-muted);
}

.chart__protocol-offer {

  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid var(--verelle-rule);
  border-radius: 8px;
  background: var(--verelle-surface);
}

.chart__protocol-offer-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.chart__protocol-offer-title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--verelle-ink);
}

.chart__protocol-offer-text {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.4;
  color: var(--verelle-ink-muted);
}

.chart__protocol-offer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.chart__protocol-offer-choose {
  min-height: 2.25rem;
  padding: 0 0.875rem;
  border: 1px solid var(--verelle-ink);
  border-radius: 6px;
  background: var(--verelle-ink);
  color: var(--verelle-surface);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
}

.chart__protocol-offer-skip {
  min-height: 2.25rem;
  padding: 0 0.75rem;
  border: 1px solid var(--verelle-rule);
  border-radius: 6px;
  background: var(--verelle-surface-sunken);
  color: var(--verelle-ink-muted);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
}
</style>



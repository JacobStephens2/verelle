<script setup lang="ts">
import { computed } from "vue";

import type { CivilDate } from "../chart/civil-date";
import type { ChartCycle, ChartDay } from "../chart/projection";
import type { CycleOverlay } from "../observations/cycle-overlay";
import type { Observation } from "../observations/observation";
import { isRecorded, mucusDisplayLabel } from "../observations/observation";
import DayExplanation from "./DayExplanation.vue";

const props = withDefaults(
  defineProps<{
    date: CivilDate;
    observation?: Observation | null;
    chartDay?: ChartDay | null;
    cycle?: ChartCycle | null;
    cycleOverlay?: CycleOverlay | null;
    showActions?: boolean;
  }>(),
  {
    showActions: true,
  },
);

const emit = defineEmits<{
  edit: [date: CivilDate];
}>();

const hasObservation = computed(() => isRecorded(props.observation));

const mucusFormatted = computed(() => {
  if (!props.observation?.mucus) return null;
  return mucusDisplayLabel(props.observation.mucus);
});

const temperatureFormatted = computed(() => {
  if (props.observation?.temperature === null || props.observation?.temperature === undefined) {
    return null;
  }
  const unit = props.observation.temperatureUnit ?? "F";
  return `${props.observation.temperature} °${unit}`;
});

const hasMissedNearExpectedPeak = computed(() => {
  if (!props.cycle) return false;
  const missedDays = props.cycle.days.filter((d) => d.monitorReading === "Missed");
  if (missedDays.length === 0) return false;
  const currentPeakDay = props.cycle.days.find((d) => d.monitorReading === "Peak")?.cycleDay;
  const firstHighDay = props.cycle.days.find((d) => d.monitorReading === "High")?.cycleDay;
  for (const md of missedDays) {
    if (currentPeakDay !== undefined) {
      if (md.cycleDay >= currentPeakDay - 2 && md.cycleDay <= currentPeakDay + 1) return true;
    } else if (firstHighDay !== undefined) {
      if (md.cycleDay >= firstHighDay && md.cycleDay <= firstHighDay + 5) return true;
    } else if (md.cycleDay >= 11 && md.cycleDay <= 17) {
      return true;
    }
  }
  return false;
});
</script>

<template>
  <div class="day-detail" data-testid="day-detail">
    <header class="day-detail-header">
      <h2 data-testid="day-detail-title">{{ date }}</h2>
    </header>

    <DayExplanation
      v-if="chartDay && cycle"
      :cycle-day="chartDay.cycleDay"
      :day-status="chartDay.dayStatus"
      :fertile-window="cycle.fertileWindow"
      :protocol-family="cycleOverlay?.protocolFamily ?? null"
      :protocol-version="cycleOverlay?.protocolVersion ?? null"
      :has-missed-near-expected-peak="hasMissedNearExpectedPeak"
    />

    <div v-if="hasObservation && observation" class="day-detail-info">
      <div v-if="observation.monitorReading" class="day-detail-row">
        <span class="day-detail-row-label">Monitor reading</span>
        <span class="day-detail-row-value">{{ observation.monitorReading }}</span>
      </div>

      <div v-if="observation.bleeding" class="day-detail-row">
        <span class="day-detail-row-label">Bleeding</span>
        <span class="day-detail-row-value">{{ observation.bleeding }}</span>
      </div>

      <div v-if="observation.peakOverride" class="day-detail-row">
        <span class="day-detail-row-label">Peak override</span>
        <span class="day-detail-row-value">Yes</span>
      </div>

      <div v-if="observation.intercourse" class="day-detail-row">
        <span class="day-detail-row-label">Intercourse</span>
        <span class="day-detail-row-value">Yes</span>
      </div>

      <div v-if="observation.lhStrip" class="day-detail-row">
        <span class="day-detail-row-label">LH strip</span>
        <span class="day-detail-row-value">{{ observation.lhStrip }}</span>
      </div>

      <div v-if="mucusFormatted" class="day-detail-row">
        <span class="day-detail-row-label">Mucus</span>
        <span class="day-detail-row-value">{{ mucusFormatted }}</span>
      </div>

      <div v-if="temperatureFormatted" class="day-detail-row">
        <span class="day-detail-row-label">Temperature</span>
        <span class="day-detail-row-value">{{ temperatureFormatted }}</span>
      </div>

      <div v-if="observation.note" class="day-detail-row">
        <span class="day-detail-row-label">Note</span>
        <span class="day-detail-row-value">{{ observation.note }}</span>
      </div>

      <div v-if="showActions" class="day-detail-actions">
        <button
          type="button"
          class="btn btn-primary"
          data-testid="edit-observation"
          @click="emit('edit', date)"
        >
          Edit
        </button>
      </div>
    </div>

    <div v-else class="empty-state" data-testid="empty-day-detail">
      <h2>No Observation</h2>
      <p>Nothing recorded for this day.</p>
      <button
        v-if="showActions"
        type="button"
        class="btn btn-primary btn-block"
        data-testid="add-observation"
        @click="emit('edit', date)"
      >
        Add Observation
      </button>
    </div>
  </div>
</template>

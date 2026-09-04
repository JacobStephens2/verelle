<script setup lang="ts">
import { computed } from "vue";

import type { CivilDate } from "../chart/civil-date";
import { displayCivilDate } from "../chart/civil-date";
import { chartCellClass } from "../chart/chart-presentation";
import type { ChartDay } from "../chart/projection";
import type { Observation } from "../observations/observation";

const props = defineProps<{
  day: ChartDay | null;
  observation?: Observation;
  isToday?: boolean;
}>();

const emit = defineEmits<{
  selectDate: [date: CivilDate];
}>();

const cellClass = computed(() => chartCellClass(props.observation));

const isPeakDay = computed(() => {
  if (!props.day) return false;
  return (
    props.observation?.peakOverride === true ||
    props.day.monitorReading === "Peak" ||
    props.day.annotations.includes("P")
  );
});

const formattedDate = computed(() => {
  if (!props.day) return "";
  return displayCivilDate(props.day.civilDate);
});

const ariaLabel = computed(() => {
  if (!props.day) return "";
  const details = [`Cycle Day ${props.day.cycleDay}`, props.day.civilDate];
  if (props.observation?.bleeding) {
    details.push(`Bleeding ${props.observation.bleeding}`);
  }
  if (props.day.monitorReading !== null) {
    details.push(`Monitor reading ${props.day.monitorReading}`);
  }
  if (props.day.annotations.length > 0) {
    details.push(`Peak count ${props.day.annotations.join(", ")}`);
  }
  if (props.observation?.intercourse) {
    details.push("intercourse recorded");
  }
  return details.join(", ");
});
</script>

<template>
  <td
    v-if="day"
    class="chart__cell"
    :class="{
      'chart__cell--today': isToday,
      'chart-peak-col': isPeakDay,
    }"
    :data-civil-date="day.civilDate"
    data-testid="chart-cell"
  >
    <button
      type="button"
      class="stamp"
      :class="cellClass"
      :aria-label="ariaLabel"
      :data-civil-date="day.civilDate"
      data-testid="chart-day"
      @click="emit('selectDate', day.civilDate)"
    >
      <span class="stamp-day">{{ formattedDate }}</span>
      <div class="stamp-circle">
        <span
          v-if="observation?.intercourse"
          class="stamp-intercourse"
          aria-label="Intercourse recorded"
        >
          ❤️
        </span>
        <span class="stamp-bleeding-dot" aria-hidden="true" />
        <span
          v-for="annotation in day.annotations"
          :key="annotation"
          class="chart__peak-annotation"
          data-testid="peak-annotation"
        >
          {{ annotation }}
        </span>
      </div>
      <span
        v-if="day.monitorReading"
        class="stamp-code chart__monitor-reading"
        data-testid="monitor-reading"
      >
        {{ day.monitorReading }}
      </span>
    </button>
  </td>
  <td
    v-else
    class="chart-empty"
    data-testid="chart-cell"
  />
</template>

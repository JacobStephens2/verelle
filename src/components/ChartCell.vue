<script setup lang="ts">
import { computed } from "vue";

import type { CivilDate } from "../chart/civil-date";
import {
  chartCellClass,
  type FertileBandCellPresentation,
} from "../chart/chart-presentation";
import type { ChartDay } from "../chart/projection";

const props = defineProps<{
  day: ChartDay | null;
  isToday?: boolean;
  band?: FertileBandCellPresentation | null;
}>();

const emit = defineEmits<{
  selectDate: [date: CivilDate];
}>();

const cellClass = computed(() => chartCellClass(props.day ?? undefined));

const bandClasses = computed(() => props.band?.classes ?? []);

const ariaLabel = computed(() => {
  if (!props.day) return "";
  const details = [`Cycle Day ${props.day.cycleDay}`, props.day.civilDate];
  if (props.day.dayStatus !== null) {
    details.push(`Day status ${props.day.dayStatus}`);
  }
  if (props.day.monitorReading !== null) {
    details.push(`Monitor reading ${props.day.monitorReading}`);
  }
  if (props.day.annotations.length > 0) {
    details.push(`Peak count ${props.day.annotations.join(", ")}`);
  }
  return details.join(", ");
});
</script>

<template>
  <td
    v-if="day"
    class="chart__cell"
    :class="[{ 'chart__cell--today': isToday }, ...bandClasses]"
    :data-civil-date="day.civilDate"
    :data-day-status="day.dayStatus ?? undefined"
    data-testid="chart-cell"
  >
    <button
      type="button"
      class="stamp"
      :class="cellClass"
      :aria-label="ariaLabel"
      :data-civil-date="day.civilDate"
      :data-day-status="day.dayStatus ?? undefined"
      data-testid="chart-day"
      @click="emit('selectDate', day.civilDate)"
    >
      <span class="stamp-day">{{ day.cycleDay }}</span>
      <div class="stamp-circle">
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
    class="chart__cell chart-empty"
    :class="bandClasses"
    data-testid="chart-cell"
  />
</template>


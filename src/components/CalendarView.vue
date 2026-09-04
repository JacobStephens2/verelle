<script setup lang="ts">
import { computed, ref, watch } from "vue";

import {
  civilDateMonth,
  displayMonth,
  firstDayOfMonth,
  getDatesInMonth,
  shiftMonth,
  type CivilDate,
} from "../chart/civil-date";
import type { Chart } from "../chart/projection";
import type { Observation } from "../observations/observation";
import {
  calendarDayPresentation,
  type CalendarDayPresentation,
} from "../chart/calendar-presentation";

const props = defineProps<{
  today: CivilDate;
  chart: Chart;
  observations?: readonly Observation[];
  selectedDate?: CivilDate;
}>();

const emit = defineEmits<{
  selectDate: [date: CivilDate];
}>();

const anchorDate = computed(() => props.selectedDate ?? props.today);
const anchorMonth = computed(() => civilDateMonth(anchorDate.value));

const currentYear = ref<number>(anchorMonth.value.year);
const currentMonth = ref<number>(anchorMonth.value.month);

watch(
  anchorMonth,
  (newMonth) => {
    currentYear.value = newMonth.year;
    currentMonth.value = newMonth.month;
  },
);

const monthTitle = computed(() =>
  displayMonth(currentYear.value, currentMonth.value),
);

const dates = computed(() =>
  getDatesInMonth(currentYear.value, currentMonth.value),
);

const startPadding = computed(() =>
  firstDayOfMonth(currentYear.value, currentMonth.value),
);

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const observationsByDate = computed(() => {
  const map = new Map<CivilDate, Observation>();
  for (const obs of props.observations ?? []) {
    map.set(obs.civilDate, obs);
  }
  return map;
});

const calendarDays = computed<readonly CalendarDayPresentation[]>(() =>
  dates.value.map((date) =>
    calendarDayPresentation(
      date,
      props.chart,
      observationsByDate.value.get(date),
      props.today,
    ),
  ),
);

const prevMonth = () => {
  const next = shiftMonth(currentYear.value, currentMonth.value, -1);
  currentYear.value = next.year;
  currentMonth.value = next.month;
};

const nextMonth = () => {
  const next = shiftMonth(currentYear.value, currentMonth.value, 1);
  currentYear.value = next.year;
  currentMonth.value = next.month;
};

const todayMonth = computed(() => civilDateMonth(props.today));

const goToToday = () => {
  currentYear.value = todayMonth.value.year;
  currentMonth.value = todayMonth.value.month;
};
</script>

<template>
  <section class="calendar-view" data-testid="calendar-view" aria-label="Calendar">
    <nav class="calendar-nav" aria-label="Month navigation">
      <button
        type="button"
        class="calendar-nav-btn"
        aria-label="Previous month"
        data-testid="calendar-prev"
        @click="prevMonth"
      >
        &#8249;
      </button>
      <h2 data-testid="calendar-month-title">{{ monthTitle }}</h2>
      <button
        type="button"
        class="calendar-nav-btn"
        aria-label="Next month"
        data-testid="calendar-next"
        @click="nextMonth"
      >
        &#8250;
      </button>
    </nav>

    <div class="calendar-grid" role="grid" aria-label="Month days">
      <div
        v-for="weekday in weekdays"
        :key="weekday"
        class="calendar-weekday"
        role="columnheader"
      >
        {{ weekday }}
      </div>

      <div
        v-for="padIndex in startPadding"
        :key="`pad-${padIndex}`"
        class="calendar-day empty"
        aria-hidden="true"
      />

      <button
        v-for="day in calendarDays"
        :key="day.civilDate"
        type="button"
        class="calendar-day"
        :class="{
          today: day.isToday,
          'has-obs': day.hasObservation,
          'cycle-start': day.isCycleStart,
          'in-fertile-window': day.inFertileWindow,
        }"
        :aria-label="day.ariaLabel"
        :data-civil-date="day.civilDate"
        data-testid="calendar-day"
        @click="emit('selectDate', day.civilDate)"
      >
        <span class="calendar-day-num">{{ day.dayNumber }}</span>
        <div
          v-if="day.hasObservation && day.markerClass"
          class="calendar-stamp"
          :class="[
            day.markerClass,
            { 'has-bleeding': day.hasBleeding && day.markerClass !== 'calendar-stamp--bleeding' },
          ]"
          data-testid="calendar-marker"
        >
          {{ day.markerLabel }}
        </div>
        <span
          v-if="day.hasIntercourse"
          class="calendar-intercourse"
          role="img"
          aria-label="Intercourse recorded"
        >
          ❤️
        </span>
      </button>
    </div>

    <div class="calendar-actions">
      <button
        type="button"
        class="calendar-today-btn"
        data-testid="calendar-today-btn"
        @click="goToToday"
      >
        Go to Today
      </button>
    </div>
  </section>
</template>

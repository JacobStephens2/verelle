<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from "vue";

import type { CivilDate } from "./chart/civil-date";
import ChartFrame from "./components/ChartFrame.vue";
import RecordObservation from "./components/RecordObservation.vue";
import { todayCivilDate } from "./chart/civil-date";
import { useObservationStore } from "./observations/store";

// The app opens on today. A Chart day or the date picker moves this selection
// only after that zero-navigation starting point has painted.
const today = computed(() => todayCivilDate());
const selectedDate = ref<CivilDate>(today.value);
const showAllFields = ref(false);
const editor = useTemplateRef<HTMLElement>("editor");

const observations = useObservationStore().observe();

const showDate = (date: CivilDate, revealAllFields: boolean) => {
  selectedDate.value = date;
  showAllFields.value = revealAllFields;
};

const selectRecordingDate = (date: CivilDate) => showDate(date, date !== today.value);

const openDayDetails = async (date: CivilDate) => {
  showDate(date, true);
  await nextTick();
  editor.value?.scrollIntoView({ block: "start" });
};
</script>

<template>
  <main class="app">
    <section ref="editor">
      <RecordObservation
        :date="selectedDate"
        :today="today"
        :observations="observations"
        :show-all-fields="showAllFields"
        @select-date="selectRecordingDate"
      />
    </section>
    <ChartFrame
      :today="today"
      :observations="observations"
      @select-date="openDayDetails"
    />
  </main>
</template>

<style scoped>
.app {
  min-height: 100vh;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}
</style>

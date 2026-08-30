<script setup lang="ts">
import { computed } from "vue";

import ChartFrame from "./components/ChartFrame.vue";
import RecordObservation from "./components/RecordObservation.vue";
import { todayCivilDate } from "./chart/civil-date";
import { useObservationStore } from "./observations/store";

// The app opens on today. There is no navigation to get here and none to get
// back, because today is the only place the recording partner starts.
const today = computed(() => todayCivilDate());

const observations = useObservationStore().observe();
</script>

<template>
  <main class="app">
    <RecordObservation :today="today" :observations="observations" />
    <ChartFrame :today="today" :observations="observations" />
  </main>
</template>

<style scoped>
.app {
  min-height: 100vh;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}
</style>

<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from "vue";

import type { CivilDate } from "./chart/civil-date";
import BackupRestore from "./components/BackupRestore.vue";
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
const showingBackup = ref(false);

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
  <BackupRestore v-if="showingBackup" @close="showingBackup = false" />
  <main v-else class="app">
    <nav class="app__utility" aria-label="Chart tools">
      <button type="button" data-testid="open-backup" @click="showingBackup = true">
        Backup &amp; restore
      </button>
    </nav>
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

.app__utility {
  display: flex;
  justify-content: flex-end;
  padding: 0.5rem 1rem 0;
}

.app__utility button {
  min-height: 2.25rem;
  padding: 0 0.625rem;
  border: 1px solid var(--verelle-rule);
  border-radius: 8px;
  background: var(--verelle-surface);
  color: var(--verelle-ink-muted);
  font: inherit;
  font-size: 0.8125rem;
}
</style>

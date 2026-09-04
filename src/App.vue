<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef } from "vue";

import type { CivilDate } from "./chart/civil-date";
import BackupRestore from "./components/BackupRestore.vue";
import ChartFrame from "./components/ChartFrame.vue";
import CycleOverlayDialog from "./components/CycleOverlayDialog.vue";
import Pairing from "./components/Pairing.vue";
import PrivacyAbout from "./components/PrivacyAbout.vue";
import ProfileSettings from "./components/ProfileSettings.vue";
import RecordObservation from "./components/RecordObservation.vue";
import { todayCivilDate } from "./chart/civil-date";
import { projectChart } from "./chart/projection";
import { useObservationStore } from "./observations/store";
import { useOwnerManager } from "./owners/owner-manager-store";
import type { PairingState } from "./owners/owner-secret-store";

// The app opens on today. A Chart day or the date picker moves this selection
// only after that zero-navigation starting point has painted.
const today = computed(() => todayCivilDate());
const selectedDate = ref<CivilDate>(today.value);
const showAllFields = ref(false);
const editor = useTemplateRef<HTMLElement>("editor");
const overlay = ref<"backup" | "privacy" | "pairing" | "profile" | "cycle" | null>(null);
const selectedCycleStartDate = ref<CivilDate | undefined>(undefined);
const pairingState = ref<PairingState>("unpaired");

const observationStore = useObservationStore();
const ownerManager = useOwnerManager();
const observations = observationStore.observe();
const cycleOverlays = observationStore.observeCycleOverlays();
const syncState = observationStore.observeSyncState();

const chart = computed(() => projectChart(observations.value, today.value));
const cycleStartDates = computed(() => chart.value.cycles.map((c) => c.startDate));

onMounted(async () => {
  pairingState.value = (await ownerManager.load()).pairingState;
});

const closePairing = async () => {
  overlay.value = null;
  pairingState.value = (await ownerManager.load()).pairingState;
};

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

const openCycleOverlay = (startDate?: CivilDate) => {
  selectedCycleStartDate.value =
    startDate ?? cycleStartDates.value[cycleStartDates.value.length - 1];
  overlay.value = "cycle";
};
</script>

<template>
  <BackupRestore v-if="overlay === 'backup'" @close="overlay = null" />
  <PrivacyAbout v-else-if="overlay === 'privacy'" @close="overlay = null" />
  <Pairing v-else-if="overlay === 'pairing'" @close="closePairing" />
  <ProfileSettings v-else-if="overlay === 'profile'" @close="overlay = null" />
  <CycleOverlayDialog
    v-else-if="overlay === 'cycle'"
    :start-date="selectedCycleStartDate"
    :cycle-start-dates="cycleStartDates"
    @close="overlay = null"
  />
  <main v-else class="app">
    <nav class="app__utility" aria-label="Chart tools">
      <button type="button" data-testid="open-profile" @click="overlay = 'profile'">
        Profile
      </button>
      <button type="button" data-testid="open-cycle-overlay" @click="openCycleOverlay(undefined)">
        Protocol
      </button>
      <button type="button" data-testid="open-privacy" @click="overlay = 'privacy'">
        Privacy &amp; about
      </button>
      <button type="button" data-testid="open-pairing" @click="overlay = 'pairing'">
        Pair phones
      </button>
      <button type="button" data-testid="open-backup" @click="overlay = 'backup'">
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
      :cycle-overlays="cycleOverlays"
      :sync-state="syncState"
      :pairing-state="pairingState"
      @select-date="openDayDetails"
      @edit-cycle="openCycleOverlay"
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
  flex-wrap: wrap;
  gap: 0.5rem;
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

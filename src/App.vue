<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef } from "vue";

import type { CivilDate } from "./chart/civil-date";
import BackupRestore from "./components/BackupRestore.vue";
import CalendarView from "./components/CalendarView.vue";
import ChartFrame from "./components/ChartFrame.vue";
import CycleOverlayDialog from "./components/CycleOverlayDialog.vue";
import InsightsView from "./components/InsightsView.vue";
import MethodGuide from "./components/MethodGuide.vue";
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
const protocolOfferSkipped = ref(false);
const currentView = ref<"chart" | "calendar" | "insights" | "guide">("chart");

const observationStore = useObservationStore();

const ownerManager = useOwnerManager();
const observations = observationStore.observe();
const cycleOverlays = observationStore.observeCycleOverlays();
const profile = observationStore.observeProfile();
const syncState = observationStore.observeSyncState();

const chart = computed(() =>
  projectChart(observations.value, today.value, cycleOverlays.value, profile.value),
);
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
    <header class="app__header">
      <div class="app__view-toggle" role="tablist" aria-label="Views">
        <button
          type="button"
          role="tab"
          class="app__view-btn"
          :class="{ active: currentView === 'chart' }"
          :aria-selected="currentView === 'chart'"
          data-testid="view-chart"
          @click="currentView = 'chart'"
        >
          Chart
        </button>
        <button
          type="button"
          role="tab"
          class="app__view-btn"
          :class="{ active: currentView === 'calendar' }"
          :aria-selected="currentView === 'calendar'"
          data-testid="view-calendar"
          @click="currentView = 'calendar'"
        >
          Calendar
        </button>
        <button
          type="button"
          role="tab"
          class="app__view-btn"
          :class="{ active: currentView === 'insights' }"
          :aria-selected="currentView === 'insights'"
          data-testid="view-insights"
          @click="currentView = 'insights'"
        >
          Insights
        </button>
        <button
          type="button"
          role="tab"
          class="app__view-btn"
          :class="{ active: currentView === 'guide' }"
          :aria-selected="currentView === 'guide'"
          data-testid="view-guide"
          @click="currentView = 'guide'"
        >
          Guide
        </button>
      </div>
      <nav class="app__utility" aria-label="Chart tools">
        <button type="button" data-testid="open-guide" @click="currentView = 'guide'">
          Method guide
        </button>
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
    </header>
    <section v-if="currentView !== 'guide'" ref="editor">
      <RecordObservation
        :date="selectedDate"
        :today="today"
        :observations="observations"
        :show-all-fields="showAllFields"
        :chart="chart"
        :cycle-overlays="cycleOverlays"
        @select-date="selectRecordingDate"
      />
    </section>
    <ChartFrame
      v-if="currentView === 'chart'"
      :today="today"
      :observations="observations"
      :cycle-overlays="cycleOverlays"
      :profile="profile"
      :sync-state="syncState"
      :pairing-state="pairingState"
      :protocol-offer-skipped="protocolOfferSkipped"
      @select-date="openDayDetails"
      @open-cycle-overlay="openCycleOverlay($event)"
      @skip-protocol-offer="protocolOfferSkipped = true"
    />
    <CalendarView
      v-else-if="currentView === 'calendar'"
      :today="today"
      :chart="chart"
      :observations="observations"
      :selected-date="selectedDate"
      @select-date="openDayDetails"
    />
    <InsightsView
      v-else-if="currentView === 'insights'"
      :today="today"
      :chart="chart"
      :observations="observations"
      :profile="profile"
    />
    <MethodGuide
      v-else-if="currentView === 'guide'"
      @back="currentView = 'chart'"
    />
  </main>


</template>

<style scoped>
.app {
  min-height: 100vh;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}

.app__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.5rem 1rem 0;
}

.app__view-toggle {
  display: inline-flex;
  background: var(--verelle-surface-sunken);
  border-radius: 999px;
  padding: 2px;
  gap: 2px;
}

.app__view-btn {
  border: none;
  background: transparent;
  color: var(--verelle-ink-muted);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  padding: 0.375rem 0.875rem;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.app__view-btn.active {
  background: var(--verelle-surface);
  color: var(--verelle-ink);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.app__utility {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0;
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

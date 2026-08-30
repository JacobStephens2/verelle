<script setup lang="ts">
import { computed, ref, watch } from "vue";

import ChoiceRow from "./ChoiceRow.vue";
import type { CivilDate } from "../chart/civil-date";
import type {
  Bleeding,
  MonitorReading,
  Mucus,
  LhStrip,
  Observation,
  ObservationFields,
  TemperatureUnit,
} from "../observations/observation";
import {
  BLEEDING_LEVELS,
  LH_STRIP_VALUES,
  MONITOR_READINGS,
  MUCUS_OBSERVATIONS,
  TEMPERATURE_UNITS,
  updateOf,
} from "../observations/observation";
import { useObservationStore } from "../observations/store";

const props = defineProps<{
  today: CivilDate;
  observations: readonly Observation[];
}>();

const store = useObservationStore();

const recorded = computed(() =>
  props.observations.find((observation) => observation.civilDate === props.today),
);

const monitorReading = ref<MonitorReading | null>(null);
const bleeding = ref<Bleeding | null>(null);
const userMarkedPeak = ref(false);
const intercourse = ref(false);
const lhStrip = ref<LhStrip | null>(null);
const mucus = ref<Mucus | null>(null);
const temperature = ref("");
const temperatureUnit = ref<TemperatureUnit>("F");
const note = ref("");

// The optional fields are collapsed by default: every optional row is one more
// thing to skip at 6am, which is what the "more" affordance exists to stop.
const showMore = ref(false);

/**
 * The fields this partner has actually edited since the last save. It decides
 * both what a save writes (see `updateOf`) and what an incoming write from the
 * other phone may move.
 */
const edited = ref(new Set<keyof ObservationFields>());

const edit = (field: keyof ObservationFields) => {
  const next = new Set(edited.value).add(field);
  // The scale is part of the reading, and one control sets both.
  if (field === "temperature") next.add("temperatureUnit");
  edited.value = next;
};

// What the couple has already recorded is what the controls start on, so
// re-opening a day shows the day rather than a blank form. A field this
// partner is midway through editing is left alone, so a write landing from the
// other phone never moves what she is looking at.
watch(
  recorded,
  (observation) => {
    if (observation === undefined) return;
    const settled = (field: keyof ObservationFields) => !edited.value.has(field);
    if (settled("monitorReading")) monitorReading.value = observation.monitorReading;
    if (settled("bleeding")) bleeding.value = observation.bleeding;
    if (settled("userMarkedPeak")) userMarkedPeak.value = observation.userMarkedPeak ?? false;
    if (settled("intercourse")) intercourse.value = observation.intercourse ?? false;
    if (settled("lhStrip")) lhStrip.value = observation.lhStrip;
    if (settled("mucus")) mucus.value = observation.mucus;
    if (settled("temperature")) {
      temperature.value = observation.temperature === null ? "" : String(observation.temperature);
      temperatureUnit.value = observation.temperatureUnit ?? "F";
    }
    if (settled("note")) note.value = observation.note ?? "";
  },
  { immediate: true },
);

/**
 * The confirmation of the last save, and nothing else. It is deliberately not
 * wired to any control's `disabled`: v1 set a global busy flag on about ten
 * controls and silently dropped taps while it was up.
 */
const savedAt = ref<CivilDate | null>(null);
let confirmationTimer: ReturnType<typeof setTimeout> | undefined;

const confirm = (date: CivilDate) => {
  savedAt.value = date;
  clearTimeout(confirmationTimer);
  confirmationTimer = setTimeout(() => {
    savedAt.value = null;
  }, 4000);
};

const save = async () => {
  const date = props.today;
  const fields = edited.value;

  // A half-typed or unparseable temperature is no temperature. The store
  // validates before it writes, and a throw there would lose the whole save
  // over an optional field.
  const reading = Number(temperature.value);
  const hasTemperature = temperature.value.trim() !== "" && Number.isFinite(reading);

  const update = updateOf(
    {
      monitorReading: monitorReading.value,
      bleeding: bleeding.value,
      userMarkedPeak: userMarkedPeak.value,
      intercourse: intercourse.value,
      lhStrip: lhStrip.value,
      mucus: mucus.value,
      temperature: hasTemperature ? reading : null,
      temperatureUnit: hasTemperature ? temperatureUnit.value : null,
      note: note.value === "" ? null : note.value,
    },
    fields,
  );

  // Nothing edited is nothing to write. Saying so is still a save - the day on
  // screen is the day in the record - but writing an empty row would turn a
  // date nobody charted into one that was.
  if (fields.size === 0) {
    confirm(date);
    return;
  }

  await store.upsert(date, update);
  edited.value = new Set();
  confirm(date);
};
</script>

<template>
  <section class="record" aria-label="Today" data-testid="record-observation">
    <header class="record__header">
      <h2 class="record__title">Today</h2>
      <p class="record__date" data-testid="record-date">{{ today }}</p>
    </header>

    <ChoiceRow
      v-model="monitorReading"
      legend="Monitor reading"
      :choices="MONITOR_READINGS"
      testid-prefix="monitor"
      @update:model-value="edit('monitorReading')"
    />

    <ChoiceRow
      v-model="bleeding"
      legend="Bleeding"
      :choices="BLEEDING_LEVELS"
      testid-prefix="bleeding"
      @update:model-value="edit('bleeding')"
    />

    <div class="record__toggles">
      <label class="record__toggle">
        <input
          v-model="userMarkedPeak"
          type="checkbox"
          data-testid="user-marked-peak"
          @change="edit('userMarkedPeak')"
        />
        <span>Mark my Peak</span>
      </label>
      <label class="record__toggle">
        <input
          v-model="intercourse"
          type="checkbox"
          data-testid="intercourse"
          @change="edit('intercourse')"
        />
        <span>Intercourse</span>
      </label>
    </div>

    <div class="record__actions">
      <button
        type="button"
        class="record__more"
        :aria-expanded="showMore"
        aria-controls="record-more"
        data-testid="toggle-more"
        @click="showMore = !showMore"
      >
        {{ showMore ? "Fewer fields" : "More fields" }}
      </button>
      <button type="button" class="record__save" data-testid="save" @click="save()">
        Save
      </button>
    </div>

    <p
      v-if="savedAt !== null"
      class="record__saved"
      role="status"
      data-testid="save-confirmation"
    >
      Saved {{ savedAt }}
    </p>

    <div v-if="showMore" id="record-more" class="record__more-fields">
      <label class="record__more-field">
        <span class="record__legend">LH strip</span>
        <select v-model="lhStrip" data-testid="lh-strip" @change="edit('lhStrip')">
          <option :value="null">Not recorded</option>
          <option v-for="value in LH_STRIP_VALUES" :key="value" :value="value">
            {{ value }}
          </option>
        </select>
      </label>

      <label class="record__more-field">
        <span class="record__legend">Mucus</span>
        <select v-model="mucus" data-testid="mucus" @change="edit('mucus')">
          <option :value="null">Not recorded</option>
          <option v-for="kind in MUCUS_OBSERVATIONS" :key="kind" :value="kind">
            {{ kind }}
          </option>
        </select>
      </label>

      <label class="record__more-field">
        <span class="record__legend">Temperature</span>
        <span class="record__temperature">
          <input
            v-model="temperature"
            type="number"
            inputmode="decimal"
            step="0.01"
            data-testid="temperature"
            @input="edit('temperature')"
          />
          <select
            v-model="temperatureUnit"
            aria-label="Temperature scale"
            data-testid="temperature-unit"
            @change="edit('temperature')"
          >
            <option v-for="unit in TEMPERATURE_UNITS" :key="unit" :value="unit">
              &deg;{{ unit }}
            </option>
          </select>
        </span>
      </label>

      <label class="record__more-field">
        <span class="record__legend">Note</span>
        <textarea
          v-model="note"
          rows="2"
          data-testid="note"
          @input="edit('note')"
        ></textarea>
      </label>
    </div>
  </section>
</template>

<style scoped>
.record {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  padding: 0.75rem 1rem 0;
}

.record__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}

.record__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.record__date {
  margin: 0;
  color: var(--verelle-ink-muted);
  font-variant-numeric: tabular-nums;
}

.record__legend {
  padding: 0;
  color: var(--verelle-ink-muted);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.record__toggles {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.25rem;
}

.record__toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.75rem;
  padding: 0 0.625rem;
  border: 1px solid var(--verelle-rule);
  border-radius: 8px;
}

.record__actions {
  display: flex;
  gap: 0.5rem;
}

.record__more,
.record__save {
  min-height: 2.75rem;
  border: 1px solid var(--verelle-rule);
  border-radius: 8px;
  background: var(--verelle-surface);
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.record__more {
  flex: 1;
}

.record__save {
  flex: 1;
  font-weight: 600;
  background: var(--verelle-surface-sunken);
}

.record__saved {
  margin: 0;
  color: var(--verelle-ink-muted);
  font-size: 0.8125rem;
}

.record__more-fields {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.record__more-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.record__more-field select,
.record__more-field input,
.record__more-field textarea {
  min-height: 2.75rem;
  padding: 0 0.5rem;
  border: 1px solid var(--verelle-rule);
  border-radius: 8px;
  background: var(--verelle-surface);
  color: inherit;
  font: inherit;
}

.record__temperature {
  display: flex;
  gap: 0.5rem;
}

.record__temperature input {
  flex: 1;
  min-width: 0;
}
</style>

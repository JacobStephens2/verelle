<script setup lang="ts">
import { computed, ref, watch } from "vue";

import ChoiceRow from "./ChoiceRow.vue";
import DayExplanation from "./DayExplanation.vue";
import type { CivilDate } from "../chart/civil-date";
import type { Chart } from "../chart/projection";
import type { CycleOverlay } from "../observations/cycle-overlay";
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
  mucusCategory,
  unrecordedObservation,
  updateOf,
} from "../observations/observation";
import { useObservationStore } from "../observations/store";
import { createRecordingEdits } from "./recording-edits";

const props = defineProps<{
  date: CivilDate;
  today: CivilDate;
  observations: readonly Observation[];
  showAllFields?: boolean;
  chart?: Chart;
  cycleOverlays?: readonly CycleOverlay[];
}>();

const activeCycle = computed(() =>
  props.chart?.cycles.find((cycle) =>
    cycle.days.some((day) => day.civilDate === props.date),
  ),
);

const activeDay = computed(() =>
  activeCycle.value?.days.find((day) => day.civilDate === props.date),
);

const activeCycleOverlay = computed(() =>
  props.cycleOverlays?.find(
    (overlay) => overlay.startDate === activeCycle.value?.startDate,
  ),
);

const emit = defineEmits<{
  selectDate: [date: CivilDate];
}>();

const store = useObservationStore();
const title = computed(() =>
  props.showAllFields === true ? "Observation details" : "Today",
);

const recorded = computed(() =>
  props.observations.find((observation) => observation.civilDate === props.date),
);

const selectDate = (event: Event) => {
  const input = event.currentTarget;
  if (!(input instanceof HTMLInputElement) || input.value === "") return;
  if (input.value <= props.today) emit("selectDate", input.value);
};

const monitorReading = ref<MonitorReading | null>(null);
const bleeding = ref<Bleeding | null>(null);
const peakOverride = ref(false);
const intercourse = ref(false);
const lhStrip = ref<LhStrip | null>(null);
const mucus = ref<Mucus | null>(null);
// Vue's v-model converts a number input to a number once edited, while a
// cleared control remains an empty string.
const temperature = ref<string | number>("");
const temperatureUnit = ref<TemperatureUnit>("F");
const note = ref("");

// The optional fields are collapsed by default: every optional row is one more
// thing to skip at 6am, which is what the "more" affordance exists to stop.
const showMore = ref(false);
const moreFieldsVisible = computed(() => props.showAllFields === true || showMore.value);

/**
 * The fields this partner has actually edited since the last save. It decides
 * both what a save writes (see `updateOf`) and what an incoming write from the
 * other phone may move.
 */
const recordingEdits = createRecordingEdits<keyof ObservationFields>();
const edited = ref<ReadonlySet<keyof ObservationFields>>(new Set());

const edit = (field: keyof ObservationFields) => {
  // The scale is part of the reading, and one control sets both.
  edited.value = recordingEdits.mark(
    field === "temperature" ? [field, "temperatureUnit"] : [field],
  );
};

const load = (observation: Observation, preserveEdited: boolean) => {
  const settled = (field: keyof ObservationFields) =>
    !preserveEdited || !edited.value.has(field);
  if (settled("monitorReading")) monitorReading.value = observation.monitorReading;
  if (settled("bleeding")) bleeding.value = observation.bleeding;
  if (settled("peakOverride")) peakOverride.value = observation.peakOverride ?? false;
  if (settled("intercourse")) intercourse.value = observation.intercourse ?? false;
  if (settled("lhStrip")) lhStrip.value = observation.lhStrip;
  if (settled("mucus")) mucus.value = observation.mucus;
  if (settled("temperature")) {
    temperature.value = observation.temperature === null ? "" : String(observation.temperature);
    temperatureUnit.value = observation.temperatureUnit ?? "F";
  }
  if (settled("note")) note.value = observation.note ?? "";
};

// Moving to another Civil date is a new editor session: load that date in
// full, including an entirely empty Observation when nobody recorded it.
watch(
  () => props.date,
  (date) => {
    edited.value = recordingEdits.reset();
    load(recorded.value ?? unrecordedObservation(date), false);
  },
  { immediate: true },
);

// An incoming write for the date already on screen refreshes only settled
// fields, so another phone never moves a control this partner is editing.
watch(recorded, (observation) => {
  load(observation ?? unrecordedObservation(props.date), true);
});

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
  const date = props.date;
  const saving = recordingEdits.snapshot();
  const { fields } = saving;

  // A half-typed or unparseable temperature is no temperature. The store
  // validates before it writes, and a throw there would lose the whole save
  // over an optional field.
  const temperatureText = String(temperature.value).trim();
  const reading = Number(temperatureText);
  const hasTemperature = temperatureText !== "" && Number.isFinite(reading);

  const update = updateOf(
    {
      monitorReading: monitorReading.value,
      bleeding: bleeding.value,
      peakOverride: peakOverride.value,
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
  edited.value = recordingEdits.settle(saving);
  confirm(date);
};
</script>

<template>
  <section class="record" :aria-label="title" data-testid="record-observation">
    <header class="record__header">
      <h2 class="record__title" data-testid="record-title">{{ title }}</h2>
      <input
        type="date"
        class="record__date-input"
        aria-label="Observation date"
        :value="date"
        :max="today"
        data-testid="record-date-input"
        @change="selectDate"
      />
    </header>

    <DayExplanation
      v-if="showAllFields && activeDay && activeCycle"
      :cycle-day="activeDay.cycleDay"
      :day-status="activeDay.dayStatus"
      :fertile-window="activeCycle.fertileWindow"
      :protocol-family="activeCycleOverlay?.protocolFamily ?? null"
      :protocol-version="activeCycleOverlay?.protocolVersion ?? null"
    />

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
          v-model="peakOverride"
          type="checkbox"
          data-testid="peak-override"
          @change="edit('peakOverride')"
        />
        <span>Peak override</span>
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
        v-if="!showAllFields"
        type="button"
        class="record__more"
        :aria-expanded="moreFieldsVisible"
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

    <div v-if="moreFieldsVisible" id="record-more" class="record__more-fields">
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
            {{ kind }} ({{ mucusCategory(kind) }})
          </option>
          <option
            v-if="mucus && !MUCUS_OBSERVATIONS.includes(mucus as any)"
            :value="mucus"
          >
            {{ mucus }} ({{ mucusCategory(mucus) }})
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

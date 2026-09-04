<script setup lang="ts">
import { computed, ref, watch } from "vue";

import type { CivilDate } from "../chart/civil-date";
import type {
  CycleOverlay,
  CycleOverlayFields,
  Intention,
  ProtocolFamily,
} from "../observations/cycle-overlay";
import {
  defaultCycleOverlay,
  defaultProtocolVersion,
  INTENTION_LABELS,
  INTENTIONS,
  PROTOCOL_FAMILIES,
  PROTOCOL_FAMILY_LABELS,
  PROTOCOL_VERSION_LABELS,
  cycleOverlayUpdateOf,
} from "../observations/cycle-overlay";
import { useObservationStore } from "../observations/store";
import { createRecordingEdits } from "./recording-edits";

const props = defineProps<{
  startDate?: CivilDate;
  cycleStartDates?: readonly CivilDate[];
}>();

const emit = defineEmits<{ close: [] }>();

const store = useObservationStore();
const overlays = store.observeCycleOverlays();

const activeStartDate = ref<CivilDate>(
  props.startDate ??
    (props.cycleStartDates && props.cycleStartDates.length > 0
      ? (props.cycleStartDates[props.cycleStartDates.length - 1] ?? ("" as CivilDate))
      : ("" as CivilDate)),
);

watch(
  () => props.startDate,
  (newStart) => {
    if (newStart) activeStartDate.value = newStart;
  },
);

const currentOverlay = computed<CycleOverlay>(() => {
  const found = overlays.value.find((o) => o.startDate === activeStartDate.value);
  return found ?? defaultCycleOverlay(activeStartDate.value);
});

const protocolFamily = ref<ProtocolFamily | null>(null);
const intention = ref<Intention | null>(null);
const postpartumCycleNumber = ref<string | number>("");

const recordingEdits = createRecordingEdits<keyof CycleOverlayFields>();
const edited = ref<ReadonlySet<keyof CycleOverlayFields>>(new Set());

const edit = (field: keyof CycleOverlayFields) => {
  edited.value = recordingEdits.mark([field]);
};

const load = (overlay: CycleOverlay, preserveEdited: boolean) => {
  const settled = (field: keyof CycleOverlayFields) =>
    !preserveEdited || !edited.value.has(field);
  if (settled("protocolFamily")) protocolFamily.value = overlay.protocolFamily;
  if (settled("intention")) intention.value = overlay.intention;
  if (settled("postpartumCycleNumber")) {
    postpartumCycleNumber.value =
      overlay.postpartumCycleNumber === null ? "" : overlay.postpartumCycleNumber;
  }
};

watch(
  activeStartDate,
  () => {
    edited.value = recordingEdits.reset();
    load(currentOverlay.value, false);
  },
  { immediate: true },
);

watch(currentOverlay, (overlay) => {
  load(overlay, true);
});

const saved = ref(false);
let saveTimer: ReturnType<typeof setTimeout> | undefined;

const save = async () => {
  if (!activeStartDate.value) return;

  const saving = recordingEdits.snapshot();
  const { fields } = saving;

  const ppNum =
    postpartumCycleNumber.value === ""
      ? null
      : Number(postpartumCycleNumber.value);
  const validPpNum = ppNum !== null && Number.isFinite(ppNum) ? ppNum : null;

  const values: CycleOverlayFields = {
    protocolFamily: protocolFamily.value,
    protocolVersion:
      protocolFamily.value !== null
        ? defaultProtocolVersion(protocolFamily.value)
        : null,
    intention: intention.value,
    postpartumCycleNumber: validPpNum,
  };

  const fieldsToWrite = new Set(fields);
  if (fields.has("protocolFamily")) {
    fieldsToWrite.add("protocolVersion");
  }

  const update = cycleOverlayUpdateOf(values, fieldsToWrite);

  if (fieldsToWrite.size > 0) {
    await store.upsertCycleOverlay(activeStartDate.value, update);
  }

  edited.value = recordingEdits.settle(saving);
  saved.value = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saved.value = false;
  }, 4000);
};
</script>

<template>
  <main class="overlay-dialog" data-testid="cycle-overlay-dialog">
    <header class="overlay-dialog__header">
      <button
        type="button"
        class="overlay-dialog__back"
        data-testid="close-cycle-overlay"
        @click="emit('close')"
      >
        Back to Chart
      </button>
      <h1>Cycle protocol &amp; intention</h1>
    </header>

    <p class="overlay-dialog__intro">
      Select which Marquette protocol family and intention apply to this Cycle.
      Saved per cycle under the Shared owner and shared between both phones.
    </p>

    <form class="overlay-dialog__form" @submit.prevent="save">
      <label v-if="(cycleStartDates && cycleStartDates.length > 1) || !startDate" class="overlay-dialog__field">
        <span class="overlay-dialog__label">Cycle Day 1 date</span>
        <select
          v-if="cycleStartDates && cycleStartDates.length > 0"
          v-model="activeStartDate"
          class="overlay-dialog__select"
          data-testid="cycle-select"
        >
          <option
            v-for="date in cycleStartDates"
            :key="date"
            :value="date"
          >
            Cycle starting {{ date }}
          </option>
        </select>
        <input
          v-else
          v-model="activeStartDate"
          type="date"
          class="overlay-dialog__input"
          data-testid="cycle-start-input"
        />
      </label>
      <p v-else class="overlay-dialog__cycle-date" data-testid="active-cycle-start">
        Cycle starting <strong>{{ activeStartDate }}</strong>
      </p>

      <label class="overlay-dialog__field">
        <span class="overlay-dialog__label">Protocol family</span>
        <select
          v-model="protocolFamily"
          class="overlay-dialog__select"
          data-testid="protocol-family-select"
          @change="edit('protocolFamily')"
        >
          <option :value="null">Not selected</option>
          <option
            v-for="family in PROTOCOL_FAMILIES"
            :key="family"
            :value="family"
          >
            {{ PROTOCOL_FAMILY_LABELS[family] }}
          </option>
        </select>
        <span
          v-if="protocolFamily"
          class="overlay-dialog__protocol-version"
          data-testid="protocol-version-display"
        >
          Published manual: {{ PROTOCOL_VERSION_LABELS[defaultProtocolVersion(protocolFamily)] }}
        </span>
      </label>

      <label class="overlay-dialog__field">
        <span class="overlay-dialog__label">Intention</span>
        <select
          v-model="intention"
          class="overlay-dialog__select"
          data-testid="intention-select"
          @change="edit('intention')"
        >
          <option :value="null">Not selected</option>
          <option
            v-for="intent in INTENTIONS"
            :key="intent"
            :value="intent"
          >
            {{ INTENTION_LABELS[intent] }}
          </option>
        </select>
      </label>

      <label
        v-if="protocolFamily === 'postpartum_return_to_cycles'"
        class="overlay-dialog__field"
      >
        <span class="overlay-dialog__label">Postpartum cycle number</span>
        <input
          v-model="postpartumCycleNumber"
          type="number"
          min="1"
          max="24"
          class="overlay-dialog__input"
          data-testid="postpartum-cycle-number"
          @input="edit('postpartumCycleNumber')"
        />
      </label>

      <div class="overlay-dialog__actions">
        <button
          type="submit"
          class="overlay-dialog__save"
          data-testid="save-cycle-overlay"
        >
          Save choices
        </button>
      </div>

      <p
        v-if="saved"
        class="overlay-dialog__saved"
        role="status"
        data-testid="cycle-overlay-save-confirmation"
      >
        Choices saved
      </p>
    </form>
  </main>
</template>

<style scoped>
.overlay-dialog {
  width: min(42rem, 100%);
  min-height: 100vh;
  margin: 0 auto;
  padding: 1rem 1rem calc(2rem + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.overlay-dialog__header {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.75rem;
}

.overlay-dialog__header h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.overlay-dialog__back {
  min-height: 2.25rem;
  padding: 0 0.75rem;
  border: 1px solid var(--verelle-rule);
  border-radius: 8px;
  background: var(--verelle-surface);
  color: var(--verelle-ink-muted);
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}

.overlay-dialog__intro {
  margin: 0;
  color: var(--verelle-ink-muted);
  font-size: 0.875rem;
  line-height: 1.4;
}

.overlay-dialog__form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.overlay-dialog__field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.overlay-dialog__label {
  color: var(--verelle-ink-muted);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0;
}

.overlay-dialog__cycle-date {
  margin: 0;
  font-size: 0.9375rem;
  color: var(--verelle-ink);
}

.overlay-dialog__protocol-version {
  font-size: 0.8125rem;
  color: var(--verelle-ink-muted);
}

.overlay-dialog__input,
.overlay-dialog__select {
  min-height: 2.75rem;
  padding: 0 0.625rem;
  border: 1px solid var(--verelle-rule);
  border-radius: 8px;
  background: var(--verelle-surface);
  color: inherit;
  font: inherit;
}

.overlay-dialog__actions {
  display: flex;
  margin-top: 0.5rem;
}

.overlay-dialog__save {
  flex: 1;
  min-height: 2.75rem;
  border: 1px solid var(--verelle-rule);
  border-radius: 8px;
  background: var(--verelle-surface-sunken);
  color: inherit;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.overlay-dialog__saved {
  margin: 0;
  color: var(--verelle-ink-muted);
  font-size: 0.8125rem;
}
</style>

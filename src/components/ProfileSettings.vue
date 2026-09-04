<script setup lang="ts">
import { ref, watch } from "vue";

import type { CivilDate } from "../chart/civil-date";
import type { Profile, ProfileFields } from "../observations/profile";
import { profileUpdateOf } from "../observations/profile";
import { useObservationStore } from "../observations/store";
import { createRecordingEdits } from "./recording-edits";

const emit = defineEmits<{ close: [] }>();

const store = useObservationStore();
const profile = store.observeProfile();

const dateOfBirth = ref<string>("");
const breastfeeding = ref(false);
const postpartum = ref(false);
const perimenopause = ref(false);
const hormonalContraceptionStop = ref<string>("");

const recordingEdits = createRecordingEdits<keyof ProfileFields>();
const edited = ref<ReadonlySet<keyof ProfileFields>>(new Set());

const edit = (field: keyof ProfileFields) => {
  edited.value = recordingEdits.mark([field]);
};

const load = (data: Profile, preserveEdited: boolean) => {
  const settled = (field: keyof ProfileFields) => !preserveEdited || !edited.value.has(field);
  if (settled("dateOfBirth")) dateOfBirth.value = data.dateOfBirth ?? "";
  if (settled("breastfeeding")) breastfeeding.value = data.breastfeeding ?? false;
  if (settled("postpartum")) postpartum.value = data.postpartum ?? false;
  if (settled("perimenopause")) perimenopause.value = data.perimenopause ?? false;
  if (settled("hormonalContraceptionStop")) {
    hormonalContraceptionStop.value = data.hormonalContraceptionStop ?? "";
  }
};

watch(
  profile,
  (incoming) => {
    load(incoming, true);
  },
  { immediate: true },
);

const saved = ref(false);
let saveTimer: ReturnType<typeof setTimeout> | undefined;

const save = async () => {
  const saving = recordingEdits.snapshot();
  const { fields } = saving;

  const dob = dateOfBirth.value.trim();
  const stop = hormonalContraceptionStop.value.trim();

  const update = profileUpdateOf(
    {
      dateOfBirth: dob === "" ? null : (dob as CivilDate),
      breastfeeding: breastfeeding.value,
      postpartum: postpartum.value,
      perimenopause: perimenopause.value,
      hormonalContraceptionStop: stop === "" ? null : (stop as CivilDate),
    },
    fields,
  );

  if (fields.size > 0) {
    await store.upsertProfile(update);
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
  <main class="profile" data-testid="profile-screen">
    <header class="profile__header">
      <button
        type="button"
        class="profile__back"
        data-testid="close-profile"
        @click="emit('close')"
      >
        Back to Chart
      </button>
      <h1>Profile &amp; circumstances</h1>
    </header>

    <p class="profile__intro">
      Date of birth and the circumstances Marquette eligibility depends on.
      Stored under the Shared owner, encrypted, and shared with your partner.
    </p>

    <form class="profile__form" @submit.prevent="save">
      <label class="profile__field">
        <span class="profile__label">Date of birth</span>
        <input
          v-model="dateOfBirth"
          type="date"
          class="profile__input"
          data-testid="profile-dob"
          @input="edit('dateOfBirth')"
        />
      </label>

      <fieldset class="profile__fieldset">
        <legend class="profile__legend">Circumstances</legend>

        <label class="profile__toggle">
          <input
            v-model="breastfeeding"
            type="checkbox"
            data-testid="profile-breastfeeding"
            @change="edit('breastfeeding')"
          />
          <span>Breastfeeding</span>
        </label>

        <label class="profile__toggle">
          <input
            v-model="postpartum"
            type="checkbox"
            data-testid="profile-postpartum"
            @change="edit('postpartum')"
          />
          <span>Postpartum</span>
        </label>

        <label class="profile__toggle">
          <input
            v-model="perimenopause"
            type="checkbox"
            data-testid="profile-perimenopause"
            @change="edit('perimenopause')"
          />
          <span>Perimenopause</span>
        </label>
      </fieldset>

      <label class="profile__field">
        <span class="profile__label">Hormonal contraception stop date</span>
        <input
          v-model="hormonalContraceptionStop"
          type="date"
          class="profile__input"
          data-testid="profile-contraception-stop"
          @input="edit('hormonalContraceptionStop')"
        />
      </label>

      <div class="profile__actions">
        <button
          type="submit"
          class="profile__save"
          data-testid="save-profile"
        >
          Save profile
        </button>
      </div>

      <p
        v-if="saved"
        class="profile__saved"
        role="status"
        data-testid="profile-save-confirmation"
      >
        Profile saved
      </p>
    </form>
  </main>
</template>

<style scoped>
.profile {
  width: min(42rem, 100%);
  min-height: 100vh;
  margin: 0 auto;
  padding: 1rem 1rem calc(2rem + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.profile__header {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.75rem;
}

.profile__header h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.profile__back {
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

.profile__intro {
  margin: 0;
  color: var(--verelle-ink-muted);
  font-size: 0.875rem;
  line-height: 1.4;
}

.profile__form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.profile__field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.profile__label,
.profile__legend {
  color: var(--verelle-ink-muted);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0;
}

.profile__input {
  min-height: 2.75rem;
  padding: 0 0.625rem;
  border: 1px solid var(--verelle-rule);
  border-radius: 8px;
  background: var(--verelle-surface);
  color: inherit;
  font: inherit;
}

.profile__fieldset {
  margin: 0;
  padding: 0;
  border: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.profile__toggle {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-height: 2.75rem;
  padding: 0 0.75rem;
  border: 1px solid var(--verelle-rule);
  border-radius: 8px;
  background: var(--verelle-surface);
  cursor: pointer;
}

.profile__actions {
  display: flex;
  margin-top: 0.5rem;
}

.profile__save {
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

.profile__saved {
  margin: 0;
  color: var(--verelle-ink-muted);
  font-size: 0.8125rem;
}
</style>

<script setup lang="ts">
/**
 * One mandatory field as a row of choices, five across a phone, so the field
 * is one tap deep and never needs a scroll.
 *
 * Tapping the choice that is already on clears the field: a value recorded by
 * mistake has to be removable without a second control.
 */
const model = defineModel<string | null>({ required: true });

defineProps<{
  legend: string;
  choices: readonly string[];
  /** Prefix for each choice's `data-testid`, e.g. `monitor` -> `monitor-High`. */
  testidPrefix: string;
}>();
</script>

<template>
  <fieldset class="choice-row">
    <legend class="choice-row__legend">{{ legend }}</legend>
    <div class="choice-row__choices">
      <button
        v-for="choice in choices"
        :key="choice"
        type="button"
        class="choice-row__choice"
        :class="{ 'choice-row__choice--on': model === choice }"
        :aria-pressed="model === choice"
        :data-testid="`${testidPrefix}-${choice}`"
        @click="model = model === choice ? null : choice"
      >
        {{ choice }}
      </button>
    </div>
  </fieldset>
</template>

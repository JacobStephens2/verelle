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

<style scoped>
.choice-row {
  margin: 0;
  padding: 0;
  border: 0;
}

.choice-row__legend {
  padding: 0;
  color: var(--verelle-ink-muted);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.choice-row__choices {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.25rem;
  margin-top: 0.25rem;
}

.choice-row__choice {
  min-height: 2.75rem;
  padding: 0.25rem 0.125rem;
  border: 1px solid var(--verelle-rule);
  border-radius: 8px;
  background: var(--verelle-surface);
  color: inherit;
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}

.choice-row__choice--on {
  border-color: currentColor;
  background: var(--verelle-surface-sunken);
  font-weight: 600;
}
</style>

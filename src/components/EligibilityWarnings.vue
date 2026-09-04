<script setup lang="ts">
import type { EligibilityWarning } from "../chart/eligibility-warnings";

defineProps<{
  warnings?: readonly EligibilityWarning[];
}>();
</script>

<template>
  <aside
    v-if="warnings && warnings.length > 0"
    class="eligibility-warnings"
    data-testid="eligibility-warnings"
    aria-label="Eligibility warnings"
  >
    <div
      v-for="warning in warnings"
      :key="warning.circumstance"
      class="eligibility-warning"
      data-testid="eligibility-warning"
    >
      <div class="eligibility-warning__header">
        <span class="eligibility-warning__badge">Eligibility notice</span>
        <h3 class="eligibility-warning__reason" data-testid="warning-reason">
          {{ warning.reason }}
        </h3>
      </div>

      <p class="eligibility-warning__limit" data-testid="warning-limit">
        {{ warning.instructionLimit }}
      </p>

      <p class="eligibility-warning__guidance" data-testid="warning-guidance">
        {{ warning.conservativeGuidance }}
      </p>

      <div class="eligibility-warning__instructor">
        <a
          :href="warning.instructorRoute.url"
          target="_blank"
          rel="noopener noreferrer"
          class="eligibility-warning__link"
          data-testid="warning-instructor-link"
        >
          {{ warning.instructorRoute.label }} &rarr;
        </a>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.eligibility-warnings {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin: 0.5rem 0;
}

.eligibility-warning {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.875rem 1rem;
  border: 1px solid var(--verelle-rule, #e2e8f0);
  border-left: 4px solid var(--verelle-amber, #d97706);
  border-radius: 8px;
  background: var(--verelle-surface-sunken, #f8fafc);
  font-size: 0.875rem;
  line-height: 1.45;
}

.eligibility-warning__header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.eligibility-warning__badge {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--verelle-amber, #d97706);
}

.eligibility-warning__reason {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--verelle-ink, #0f172a);
}

.eligibility-warning__limit,
.eligibility-warning__guidance {
  margin: 0;
  color: var(--verelle-ink-muted, #475569);
}

.eligibility-warning__instructor {
  margin-top: 0.25rem;
}

.eligibility-warning__link {
  font-weight: 600;
  color: var(--verelle-ink, #0f172a);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.eligibility-warning__link:hover {
  color: var(--verelle-ink-vivid, #0284c7);
}
</style>

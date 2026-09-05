<script setup lang="ts">
defineProps<{
  compact?: boolean;
}>();
</script>

<template>
  <aside
    class="monitor-coaching"
    :class="{ 'monitor-coaching--compact': compact }"
    data-testid="monitor-setup-coaching"
    aria-label="Monitor setup coaching"
  >
    <div class="monitor-coaching__header">
      <h3 class="monitor-coaching__title">
        Monitor setup coaching
      </h3>
      <p class="monitor-coaching__subtitle">
        Essential Clearblue Fertility Monitor setup instructions to avoid lost data or missed Peak detection.
      </p>
    </div>

    <div class="monitor-coaching__cards">
      <!-- 1. The m button -->
      <section
        class="monitor-coaching__card"
        data-testid="coaching-m-button"
      >
        <h4 class="monitor-coaching__card-title">
          The <kbd class="monitor-coaching__key">m</kbd> button
        </h4>
        <p class="monitor-coaching__card-body">
          Press and hold the <kbd class="monitor-coaching__key">m</kbd> button on the morning of Cycle Day 1
          (the first day of full menstrual bleeding, or up to day 5). Setting the
          <kbd class="monitor-coaching__key">m</kbd> button resets the monitor's day counter and registers
          Day 1 of the new cycle.
        </p>
      </section>

      <!-- 2. The testing window -->
      <section
        class="monitor-coaching__card"
        data-testid="coaching-testing-window"
      >
        <h4 class="monitor-coaching__card-title">The six-hour testing window</h4>
        <p class="monitor-coaching__card-body">
          The time you press the <kbd class="monitor-coaching__key">m</kbd> button sets your daily testing window
          for the entire cycle: 3 hours before to 3 hours after that time (a 6-hour window).
          The monitor only requests and evaluates tests inside this window each morning.
        </p>
      </section>

      <!-- 3. First-morning urine -->
      <section
        class="monitor-coaching__card"
        data-testid="coaching-first-morning-urine"
      >
        <h4 class="monitor-coaching__card-title">First-morning urine</h4>
        <p class="monitor-coaching__card-body">
          Always test using first-morning urine immediately after waking from sleep.
          Urine after sleeping has the highest concentration of estrogen and LH hormone metabolites.
          Testing with diluted daytime urine increases the chance of missing an LH surge.
        </p>
      </section>

      <!-- 4. The twenty-test limit -->
      <section
        class="monitor-coaching__card"
        data-testid="coaching-twenty-test-limit"
      >
        <h4 class="monitor-coaching__card-title">The twenty-test limit</h4>
        <p class="monitor-coaching__card-body">
          The monitor requests 10 tests per cycle, and up to 20 tests if Peak fertility is not detected
          in the first 10 days. The monitor has a firm limit of twenty tests per cycle and stops requesting
          tests once 20 tests are completed.
        </p>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.monitor-coaching {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  padding: 1rem;
  border: 1px solid var(--verelle-rule, #e2e8f0);
  border-radius: 10px;
  background: var(--verelle-surface-sunken, #f8fafc);
}

.monitor-coaching--compact {
  padding: 0.75rem;
  gap: 0.625rem;
}

.monitor-coaching__header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.monitor-coaching__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--verelle-ink, #0f172a);
}

.monitor-coaching__subtitle {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--verelle-ink-muted, #64748b);
  line-height: 1.4;
}

.monitor-coaching__cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 0.75rem;
}

.monitor-coaching__card {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.75rem;
  border: 1px solid var(--verelle-rule, #e2e8f0);
  border-radius: 8px;
  background: var(--verelle-surface, #ffffff);
}

.monitor-coaching__card-title {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--verelle-ink, #0f172a);
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.monitor-coaching__key {
  display: inline-block;
  padding: 0.125rem 0.375rem;
  font-family: ui-monospace, monospace;
  font-size: 0.8125rem;
  font-weight: 700;
  background: var(--verelle-surface-sunken, #f1f5f9);
  border: 1px solid var(--verelle-rule, #cbd5e1);
  border-radius: 4px;
}

.monitor-coaching__card-body {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--verelle-ink-muted, #475569);
}
</style>

<script setup lang="ts">
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <main class="privacy" data-testid="privacy-screen">
    <header class="privacy__header">
      <button type="button" class="privacy__back" data-testid="close-privacy" @click="emit('close')">
        Back to Chart
      </button>
      <h1>Privacy and about</h1>
    </header>

    <section aria-labelledby="about-title" class="privacy__section">
      <h2 id="about-title">About Verelle</h2>
      <p>
        Verelle is a record-and-display chart for couples using the Marquette Method.
        It records what the couple observed and lays it out as an instructor-readable
        chart. It does not tell them what their data means.
      </p>
    </section>

    <section aria-labelledby="identity-title" class="privacy__section">
      <h2 id="identity-title">No account, no email, no password</h2>
      <p data-testid="no-account">
        There is no account, no email, and no password. Using Verelle does not mean
        handing your identity to anybody.
      </p>
    </section>

    <section aria-labelledby="relay-title" class="privacy__section">
      <h2 id="relay-title">What the Relay knows</h2>
      <p>
        The Relay passes encrypted changes between the couple's phones.
      </p>
      <p data-testid="relay-content-guarantee">
        The Relay operator cannot read Chart content.
      </p>
      <p data-testid="relay-metadata-disclosure">
        The Relay operator does learn that a given owner synced, when, and roughly how much.
      </p>
    </section>

    <section aria-labelledby="loss-title" class="privacy__section">
      <h2 id="loss-title">Losing the Owner secret</h2>
      <p>
        The Owner secret is the 24 Shared owner words you write down in Backup
        &amp; restore.
      </p>
      <p class="privacy__warning" data-testid="owner-loss-warning">
        If you lose these words, you lose the Chart. Nobody can restore it.
      </p>
    </section>
  </main>
</template>

<style scoped>
.privacy {
  width: min(42rem, 100%);
  min-height: 100vh;
  margin: 0 auto;
  padding: calc(env(safe-area-inset-top) + 1rem) 1rem
    calc(env(safe-area-inset-bottom) + 2rem);
}

.privacy__header {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.privacy__header h1,
.privacy__section h2 {
  margin: 0;
}

.privacy__header h1 {
  font-size: 1.35rem;
}

.privacy__back {
  min-height: 2.75rem;
  padding: 0 0.75rem;
  border: 1px solid var(--verelle-rule);
  border-radius: 8px;
  background: var(--verelle-surface-sunken);
  color: inherit;
  font: inherit;
  font-weight: 600;
}

.privacy__section {
  margin-top: 1.5rem;
  padding: 1rem;
  border: 1px solid var(--verelle-rule);
  border-radius: 12px;
  background: var(--verelle-surface);
}

.privacy__section h2 {
  font-size: 1.1rem;
}

.privacy__section p {
  margin: 0.75rem 0 0;
}

.privacy__warning {
  font-weight: 700;
}
</style>

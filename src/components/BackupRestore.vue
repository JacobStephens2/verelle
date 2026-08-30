<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import { useOwnerManager } from "../owners/owner-manager-store";

const emit = defineEmits<{ close: [] }>();
const ownerManager = useOwnerManager();

const sharedOwnerMnemonic = ref("");
const restorePhrase = ref("");
const restoreError = ref("");
const restoreStatus = ref("");
const backupWords = computed(() => sharedOwnerMnemonic.value.split(" ").filter(Boolean));

onMounted(async () => {
  const owners = await ownerManager.load();
  sharedOwnerMnemonic.value = owners.sharedOwnerMnemonic;
});

const restore = async () => {
  restoreError.value = "";
  restoreStatus.value = "";

  try {
    const result = await ownerManager.restoreSharedOwner(restorePhrase.value);
    if (!result.ok) {
      restoreError.value = result.message;
      return;
    }

    restoreStatus.value = "Backup accepted. Restoring your Chart…";
    globalThis.location.reload();
  } catch {
    restoreError.value = "The Shared owner could not be saved. Try again.";
  }
};
</script>

<template>
  <main class="backup" data-testid="backup-screen">
    <header class="backup__header">
      <button type="button" class="backup__back" data-testid="close-backup" @click="emit('close')">
        Back to Chart
      </button>
      <h1>Backup and restore</h1>
    </header>

    <section aria-labelledby="record-backup-title" class="backup__section">
      <h2 id="record-backup-title">Write down your Shared owner</h2>
      <p>
        These 24 words are the only way to restore this Chart on a new phone.
        Write them down and keep them offline.
      </p>
      <p class="backup__warning" data-testid="owner-loss-warning">
        If you lose these words, you lose the Chart. Nobody can restore it.
      </p>
      <ol v-if="backupWords.length === 24" class="backup__words" data-testid="shared-owner-words">
        <li v-for="(word, index) in backupWords" :key="`${index}-${word}`">{{ word }}</li>
      </ol>
      <p v-else role="status">Opening your secure backup…</p>
    </section>

    <section aria-labelledby="restore-title" class="backup__section">
      <h2 id="restore-title">Restore a Chart</h2>
      <p>On a fresh install, enter the 24 words you wrote down.</p>
      <label class="backup__restore-field">
        <span>Shared owner words</span>
        <textarea
          v-model="restorePhrase"
          rows="5"
          autocomplete="off"
          autocapitalize="none"
          autocorrect="off"
          :spellcheck="false"
          data-testid="restore-phrase"
        ></textarea>
      </label>
      <button type="button" class="backup__restore" data-testid="restore-chart" @click="restore">
        Restore Chart
      </button>
      <p v-if="restoreError" class="backup__error" role="alert" data-testid="restore-error">
        {{ restoreError }}
      </p>
      <p v-if="restoreStatus" role="status" data-testid="restore-status">
        {{ restoreStatus }}
      </p>
    </section>
  </main>
</template>

<style scoped>
.backup {
  width: min(42rem, 100%);
  min-height: 100vh;
  margin: 0 auto;
  padding: calc(env(safe-area-inset-top) + 1rem) 1rem
    calc(env(safe-area-inset-bottom) + 2rem);
}

.backup__header {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.backup__header h1,
.backup__section h2 {
  margin: 0;
}

.backup__header h1 {
  font-size: 1.35rem;
}

.backup__back,
.backup__restore {
  min-height: 2.75rem;
  padding: 0 0.75rem;
  border: 1px solid var(--verelle-rule);
  border-radius: 8px;
  background: var(--verelle-surface-sunken);
  color: inherit;
  font: inherit;
  font-weight: 600;
}

.backup__section {
  margin-top: 1.5rem;
  padding: 1rem;
  border: 1px solid var(--verelle-rule);
  border-radius: 12px;
  background: var(--verelle-surface);
}

.backup__section h2 {
  font-size: 1.1rem;
}

.backup__warning,
.backup__error {
  font-weight: 700;
}

.backup__words {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.35rem 1.5rem;
  margin: 1rem 0 0;
  padding: 1rem 1rem 1rem 3rem;
  border-radius: 8px;
  background: var(--verelle-surface-sunken);
}

.backup__words li {
  padding-left: 0.25rem;
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
}

.backup__restore-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
  color: var(--verelle-ink-muted);
  font-size: 0.85rem;
  font-weight: 600;
}

.backup__restore-field textarea {
  width: 100%;
  padding: 0.65rem;
  border: 1px solid var(--verelle-rule);
  border-radius: 8px;
  background: var(--verelle-surface);
  color: var(--verelle-ink);
  font: inherit;
  font-weight: 400;
}

@media (min-width: 32rem) {
  .backup__words {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>

<script setup lang="ts">
import type { ChartZoom } from "../chart/chart-presentation";

const model = defineModel<ChartZoom>({ required: true });

const zoomLevels: readonly { readonly value: ChartZoom; readonly label: string; readonly aria: string }[] = [
  { value: "normal", label: "Normal", aria: "Normal zoom" },
  { value: "compact", label: "Compact", aria: "Compact zoom — smaller stamps" },
  { value: "trend", label: "Trend", aria: "Trend view — dense overview" },
];
</script>

<template>
  <div class="chart-toolbar">
    <div class="chart-zoom" role="radiogroup" aria-label="Chart zoom">
      <button
        v-for="lvl in zoomLevels"
        :key="lvl.value"
        type="button"
        class="chart-zoom-btn"
        :class="{ active: model === lvl.value }"
        role="radio"
        :aria-label="lvl.aria"
        :aria-checked="model === lvl.value"
        :data-testid="`zoom-${lvl.value}`"
        @click="model = lvl.value"
      >
        {{ lvl.label }}
      </button>
    </div>
  </div>
</template>

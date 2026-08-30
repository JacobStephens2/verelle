<script setup lang="ts">
import ChartFrame from "./components/ChartFrame.vue";
</script>

<template>
  <main class="app">
    <ChartFrame />
  </main>
</template>

<style scoped>
.app {
  min-height: 100vh;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}
</style>

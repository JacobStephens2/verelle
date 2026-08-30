// First, and on its own line, because ES imports are hoisted: a bare
// `installPolyfills()` call in this file would run after every import below
// it, including the one that reaches Evolu. See src/evolu-polyfills.ts for
// what breaks without it.
import "./evolu-polyfills";

import { createApp } from "vue";

import App from "./App.vue";
import { createEvoluObservationStore } from "./observations/evolu-store";
import { observationStoreKey } from "./observations/store";
import "./style.css";

// The store is created once, here, and handed down. Evolu is reached only
// through it; no view imports Evolu.
createApp(App).provide(observationStoreKey, createEvoluObservationStore()).mount("#app");

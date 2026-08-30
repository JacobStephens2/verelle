import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  build: {
    // The native shells bundle these assets (ADR 0010), so everything the app
    // needs at launch has to be in the build output - nothing is fetched.
    outDir: "dist",
    emptyOutDir: true,
  },
  worker: {
    // Evolu's workers are ES modules and import each other; the iife default
    // cannot express that.
    format: "es",
  },
  optimizeDeps: {
    // The sqlite-wasm glue must not be pre-bundled - esbuild rewrites the
    // import.meta.url that the .wasm lookup depends on.
    exclude: ["@evolu/common", "@evolu/web", "@evolu/sqlite-wasm"],
  },
});

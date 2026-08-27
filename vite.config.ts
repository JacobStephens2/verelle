import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  build: {
    // The native shells bundle these assets (ADR 0010), so everything the app
    // needs at launch has to be in the build output — nothing is fetched.
    outDir: "dist",
    emptyOutDir: true,
  },
});

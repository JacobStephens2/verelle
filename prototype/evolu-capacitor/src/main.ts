/// PROTOTYPE. Throwaway.
// Must come first: Evolu touches DisposableStack during module init.
import "./polyfill-disposable";
import { createApp } from "vue";
import App from "./App.vue";

// The phone has no console, so uncaught failures must reach the screen.
const shout = (label: string, detail: unknown) => {
  const el = document.createElement("pre");
  el.style.cssText = "background:#b91c1c;color:#fff;padding:8px;white-space:pre-wrap";
  el.textContent = `${label}: ${String(detail)}`;
  document.body.prepend(el);
};
addEventListener("error", (e) => shout("window error", e.message));
addEventListener("unhandledrejection", (e) => shout("unhandled rejection", e.reason));

createApp(App).mount("#app");

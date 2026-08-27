import type { CapacitorConfig } from "@capacitor/cli";

// `server.url` is deliberately absent and must stay absent (ADR 0010). Setting
// it turns both shells into thin WebViews that load a live site, so the first
// navigation of a cold launch is an HTTP request and recording offline fails
// outright — on iOS it fails warm too, because WKWebView runs service workers
// only under WKAppBoundDomains. Chart35 sets it and would have loaded the WASM
// and both Evolu workers over the network (JacobStephens2/chart35#51).
//
// `scripts/verify-no-server-url.mjs` fails the build if it ever reappears,
// here or in a generated native config, so a debugging session that flips it
// cannot be left that way.
const config: CapacitorConfig = {
  appId: "app.verelle",
  appName: "Verelle",
  webDir: "dist",
  ios: {
    // Edge-to-edge WebView; CSS env(safe-area-inset-*) handles the notch and
    // the home indicator.
    contentInset: "never",
  },
};

export default config;

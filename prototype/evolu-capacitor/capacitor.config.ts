/// PROTOTYPE. Throwaway.
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.verelle.probe",
  appName: "VerelleProbe",
  webDir: "dist",

  // ADR 0007: assets are bundled into the shell. `server.url` is deliberately
  // ABSENT — not empty, absent. Setting it would make the app load from the
  // network, which would silently invalidate criterion 4 (cold launch offline)
  // and is exactly what chart35 does and Verelle must not.
  //
  // The custom scheme still has to yield a secure context, or OPFS is gone.
  // That is what the Environment panel checks on device.
  ios: {
    contentInset: "never",
  },
  android: {
    // Default is `http://localhost`, which is treated as a secure context.
    allowMixedContent: false,
  },
};

export default config;

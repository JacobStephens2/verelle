import { Capacitor, registerPlugin } from "@capacitor/core";
import { OwnerSecret, type OwnerSecret as OwnerSecretValue } from "@evolu/common";

import type { OwnerSecretStore, OwnerSecrets } from "./owner-secret-store";

interface EncodedOwnerSecrets {
  readonly deviceOwner: string;
  readonly sharedOwner: string;
}

interface OwnerSecretsPlugin {
  loadOrCreate: () => Promise<EncodedOwnerSecrets>;
  replaceSharedOwner: (options: { readonly sharedOwner: string }) => Promise<void>;
}

const ownerSecretsPlugin = registerPlugin<OwnerSecretsPlugin>("OwnerSecrets");

const decodeSecret = (encoded: string): OwnerSecretValue => {
  const binary = globalThis.atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return OwnerSecret.orThrow(bytes);
};

const encodeSecret = (secret: OwnerSecretValue): string => {
  let binary = "";
  for (const byte of secret) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
};

interface BrowserSmokeGlobal {
  readonly __VERELLE_BROWSER_SMOKE_OWNER_SECRETS__?: EncodedOwnerSecrets;
}

/**
 * Browser-only harness for the existing WebView smoke tests.
 *
 * Verelle does not ship as a web app. Native builds never enter this branch;
 * both secrets come from the platform plugin. Deriving these runtime-only
 * values keeps the browser reload smoke meaningful without placing owner
 * material in a web-storage surface or in the repository.
 */
function createDevelopmentOwnerSecretStore(): OwnerSecretStore {
  if (!import.meta.env.DEV) {
    throw new Error("Owner secrets require the native Verelle app");
  }

  const injected = (globalThis as BrowserSmokeGlobal)
    .__VERELLE_BROWSER_SMOKE_OWNER_SECRETS__;
  if (injected === undefined) {
    throw new Error("The browser smoke owner was not provided");
  }

  let replacement: OwnerSecretValue | undefined;
  const initial = {
    deviceOwner: decodeSecret(injected.deviceOwner),
    sharedOwner: decodeSecret(injected.sharedOwner),
  };

  return {
    loadOrCreate: async () => {
      return {
        deviceOwner: initial.deviceOwner,
        sharedOwner: replacement ?? initial.sharedOwner,
      };
    },
    replaceSharedOwner: async (sharedOwner) => {
      replacement = sharedOwner;
    },
  };
}

/** The owner-secret adapter used by the app entry point. */
export function createCapacitorOwnerSecretStore(): OwnerSecretStore {
  if (!Capacitor.isNativePlatform()) return createDevelopmentOwnerSecretStore();

  return {
    loadOrCreate: async (): Promise<OwnerSecrets> => {
      const stored = await ownerSecretsPlugin.loadOrCreate();
      return {
        deviceOwner: decodeSecret(stored.deviceOwner),
        sharedOwner: decodeSecret(stored.sharedOwner),
      };
    },
    replaceSharedOwner: async (sharedOwner) => {
      await ownerSecretsPlugin.replaceSharedOwner({
        sharedOwner: encodeSecret(sharedOwner),
      });
    },
  };
}

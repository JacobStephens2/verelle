import { Capacitor, registerPlugin } from "@capacitor/core";
import { OwnerSecret, type OwnerSecret as OwnerSecretValue } from "@evolu/common";

import {
  asPairingState,
  type OwnerSecretStore,
  type OwnerSecrets,
  type PairingState,
} from "./owner-secret-store";

interface EncodedOwnerSecrets {
  readonly deviceOwner: string;
  readonly sharedOwner: string;
  readonly pairingState: string;
}

interface OwnerSecretsPlugin {
  loadOrCreate: () => Promise<EncodedOwnerSecrets>;
  replaceSharedOwner: (options: { readonly sharedOwner: string }) => Promise<void>;
  joinSharedOwner: (options: { readonly sharedOwner: string }) => Promise<void>;
  setPairingState: (options: { readonly pairingState: PairingState }) => Promise<void>;
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

interface BrowserSmokeOwnerStore {
  readonly loadOrCreate: () => Promise<EncodedOwnerSecrets>;
  readonly replaceSharedOwner: (options: {
    readonly sharedOwner: string;
  }) => Promise<void>;
  readonly joinSharedOwner: (options: {
    readonly sharedOwner: string;
  }) => Promise<void>;
  readonly setPairingState: (options: {
    readonly pairingState: PairingState;
  }) => Promise<void>;
}

interface BrowserSmokeGlobal {
  readonly __VERELLE_BROWSER_SMOKE_OWNER_STORE__?: BrowserSmokeOwnerStore;
}

const generateSecret = (): OwnerSecretValue => {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return OwnerSecret.orThrow(bytes);
};

const BROWSER_DEVICE_OWNER_KEY = "verelle.deviceOwner";
const BROWSER_SHARED_OWNER_KEY = "verelle.sharedOwner";
const BROWSER_PAIRING_STATE_KEY = "verelle.pairingState";

function createBrowserOwnerSecretStore(): OwnerSecretStore {
  return {
    loadOrCreate: async () => {
      let deviceEncoded = globalThis.localStorage?.getItem(BROWSER_DEVICE_OWNER_KEY);
      let sharedEncoded = globalThis.localStorage?.getItem(BROWSER_SHARED_OWNER_KEY);
      const pairingState = asPairingState(
        globalThis.localStorage?.getItem(BROWSER_PAIRING_STATE_KEY) ?? undefined,
      );

      if (!deviceEncoded) {
        deviceEncoded = encodeSecret(generateSecret());
        globalThis.localStorage?.setItem(BROWSER_DEVICE_OWNER_KEY, deviceEncoded);
      }
      if (!sharedEncoded) {
        sharedEncoded = encodeSecret(generateSecret());
        globalThis.localStorage?.setItem(BROWSER_SHARED_OWNER_KEY, sharedEncoded);
      }

      return {
        deviceOwner: decodeSecret(deviceEncoded),
        sharedOwner: decodeSecret(sharedEncoded),
        pairingState,
      };
    },
    replaceSharedOwner: async (sharedOwner) => {
      globalThis.localStorage?.setItem(BROWSER_SHARED_OWNER_KEY, encodeSecret(sharedOwner));
    },
    joinSharedOwner: async (sharedOwner) => {
      globalThis.localStorage?.setItem(BROWSER_SHARED_OWNER_KEY, encodeSecret(sharedOwner));
      globalThis.localStorage?.setItem(BROWSER_PAIRING_STATE_KEY, "shared");
    },
    setPairingState: async (pairingState) => {
      globalThis.localStorage?.setItem(BROWSER_PAIRING_STATE_KEY, pairingState);
    },
  };
}

/**
 * Browser-only harness for the existing WebView smoke tests and web previews.
 *
 * Native builds never enter this branch; both secrets come from the platform plugin.
 * When running under the browser smoke test harness, injected runtime values are used.
 * When accessed directly in a web browser, localStorage is used.
 */
function createDevelopmentOwnerSecretStore(): OwnerSecretStore {
  const injected = (globalThis as BrowserSmokeGlobal)
    .__VERELLE_BROWSER_SMOKE_OWNER_STORE__;
  if (injected !== undefined) {
    return {
      loadOrCreate: async () => {
        const stored = await injected.loadOrCreate();
        return {
          deviceOwner: decodeSecret(stored.deviceOwner),
          sharedOwner: decodeSecret(stored.sharedOwner),
          pairingState: asPairingState(stored.pairingState),
        };
      },
      replaceSharedOwner: async (sharedOwner) => {
        await injected.replaceSharedOwner({ sharedOwner: encodeSecret(sharedOwner) });
      },
      joinSharedOwner: async (sharedOwner) => {
        await injected.joinSharedOwner({ sharedOwner: encodeSecret(sharedOwner) });
      },
      setPairingState: async (pairingState) => {
        await injected.setPairingState({ pairingState });
      },
    };
  }

  return createBrowserOwnerSecretStore();
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
        pairingState: asPairingState(stored.pairingState),
      };
    },
    replaceSharedOwner: async (sharedOwner) => {
      await ownerSecretsPlugin.replaceSharedOwner({
        sharedOwner: encodeSecret(sharedOwner),
      });
    },
    joinSharedOwner: async (sharedOwner) => {
      await ownerSecretsPlugin.joinSharedOwner({
        sharedOwner: encodeSecret(sharedOwner),
      });
    },
    setPairingState: (pairingState) =>
      ownerSecretsPlugin.setPairingState({ pairingState }),
  };
}

import {
  createAppOwner,
  createSharedOwner,
  Mnemonic,
  mnemonicToOwnerSecret,
  ownerSecretToMnemonic,
  type AppOwner,
  type SharedOwner,
} from "@evolu/common";

import type { OwnerSecretStore } from "./owner-secret-store";

export interface LoadedOwners {
  /** Evolu's AppOwner: the Device owner that never leaves this phone. */
  readonly deviceOwner: AppOwner;
  /** The couple's collaborative owner: one Shared owner, one Chart. */
  readonly sharedOwner: SharedOwner;
  /** The only owner material the backup screen may reveal. */
  readonly sharedOwnerMnemonic: Mnemonic;
}

export type RestoreSharedOwnerResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

export interface OwnerManager {
  load: () => Promise<LoadedOwners>;
  restoreSharedOwner: (phrase: string) => Promise<RestoreSharedOwnerResult>;
}

const normalizePhrase = (phrase: string): string =>
  phrase.trim().toLowerCase().split(/\s+/u).join(" ");

/** Creates Evolu owners from material held by an {@link OwnerSecretStore}. */
export function createOwnerManager(secretStore: OwnerSecretStore): OwnerManager {
  const owners = secretStore.loadOrCreate().then(({ deviceOwner, sharedOwner }) => ({
    deviceOwner: createAppOwner(deviceOwner),
    sharedOwner: createSharedOwner(sharedOwner),
    sharedOwnerMnemonic: ownerSecretToMnemonic(sharedOwner),
  }));

  return {
    load: () => owners,
    restoreSharedOwner: async (phrase) => {
      const normalized = normalizePhrase(phrase);
      if (!Mnemonic.is(normalized)) {
        return {
          ok: false,
          message: "Enter all 24 words exactly as they were shown.",
        };
      }

      await secretStore.replaceSharedOwner(mnemonicToOwnerSecret(normalized));
      return { ok: true };
    },
  };
}

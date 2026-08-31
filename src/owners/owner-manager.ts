import {
  createAppOwner,
  createSharedOwner,
  Mnemonic,
  mnemonicToOwnerSecret,
  ownerSecretToMnemonic,
  type AppOwner,
  type OwnerSecret,
  type SharedOwner,
} from "@evolu/common";

import { pairingCodeFromSharedOwner, parsePairingCode } from "./pairing-code";
import { asPairingState, type OwnerSecretStore, type PairingState } from "./owner-secret-store";

export interface LoadedOwners {
  /** Evolu's AppOwner: the Device owner that never leaves this phone. */
  readonly deviceOwner: AppOwner;
  /** The couple's collaborative owner: one Shared owner, one Chart. */
  readonly sharedOwner: SharedOwner;
  /** The only owner material the backup screen may reveal. */
  readonly sharedOwnerMnemonic: Mnemonic;
  /** Whether this phone is on a shared Chart. */
  readonly pairingState: PairingState;
}

export type RestoreSharedOwnerResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

export type JoinSharedOwnerResult = RestoreSharedOwnerResult;

export interface OwnerManager {
  load: () => Promise<LoadedOwners>;
  restoreSharedOwner: (phrase: string) => Promise<RestoreSharedOwnerResult>;
  /**
   * Returns the pairing code for this phone's Shared owner. Showing the code
   * does not persist pairing state; the Chart stays unpaired until the couple
   * attests that both phones match, or the other phone joins.
   */
  showPairingCode: () => Promise<string>;
  /**
   * Records the in-person attestation that both phones display the same Chart.
   */
  confirmShared: () => Promise<void>;
  /** Joins the Chart named by a pairing code, or fails without changing this phone. */
  joinSharedOwner: (code: string) => Promise<JoinSharedOwnerResult>;
}

const normalizePhrase = (phrase: string): string =>
  phrase.trim().toLowerCase().split(/\s+/u).join(" ");

/** Creates Evolu owners from material held by an {@link OwnerSecretStore}. */
export function createOwnerManager(secretStore: OwnerSecretStore): OwnerManager {
  let rawSharedOwner!: OwnerSecret;
  let owners = secretStore.loadOrCreate().then((secrets) => {
    rawSharedOwner = secrets.sharedOwner;
    return {
      deviceOwner: createAppOwner(secrets.deviceOwner),
      sharedOwner: createSharedOwner(secrets.sharedOwner),
      sharedOwnerMnemonic: ownerSecretToMnemonic(secrets.sharedOwner),
      pairingState: asPairingState(secrets.pairingState),
    };
  });

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
    showPairingCode: async () => {
      await owners;
      return pairingCodeFromSharedOwner(rawSharedOwner);
    },
    confirmShared: async () => {
      const current = await owners;
      await secretStore.setPairingState("shared");
      owners = Promise.resolve({ ...current, pairingState: "shared" });
    },
    joinSharedOwner: async (code) => {
      const parsed = parsePairingCode(code);
      if (!parsed.ok) return parsed;

      await secretStore.joinSharedOwner(parsed.sharedOwner);
      return { ok: true };
    },
  };
}

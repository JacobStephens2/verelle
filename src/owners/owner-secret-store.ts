import type { OwnerSecret } from "@evolu/common";

/**
 * Whether this phone's Chart is unpaired, waiting on an in-person
 * confirmation, or confirmed as shared with a second phone.
 */
export type PairingState = "unpaired" | "pending" | "shared";

/** The two secrets the native keystore preserves for one installation. */
export interface OwnerSecrets {
  readonly deviceOwner: OwnerSecret;
  readonly sharedOwner: OwnerSecret;
  readonly pairingState: PairingState;
}

/**
 * The platform-keystore boundary.
 *
 * Native storage, generation, and replacement stay behind this interface so
 * the rest of the app deals in Evolu owners rather than Capacitor calls.
 */
export interface OwnerSecretStore {
  /** Loads both secrets, creating either missing secret inside the keystore. */
  loadOrCreate: () => Promise<OwnerSecrets>;

  /** Atomically replaces only the Shared owner during a restore. */
  replaceSharedOwner: (sharedOwner: OwnerSecret) => Promise<void>;

  /**
   * Replaces this phone's Shared owner and marks the Chart shared together.
   * Invalid codes never reach this method; a failed write must not reload.
   */
  joinSharedOwner: (sharedOwner: OwnerSecret) => Promise<void>;

  /**
   * Persists pairing state without changing the Shared owner. Showing a code
   * is pending; backing out is unpaired; a human attestation is shared.
   */
  setPairingState: (pairingState: PairingState) => Promise<void>;
}

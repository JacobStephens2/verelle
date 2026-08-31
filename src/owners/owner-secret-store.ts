import type { OwnerSecret } from "@evolu/common";

/**
 * Whether this phone's Chart is only on this phone, or confirmed as shared
 * with a second phone. Showing a pairing code does not persist a third state.
 */
export type PairingState = "unpaired" | "shared";

/** Leftover `pending` values from the prior branch tip fail closed to unpaired. */
export const asPairingState = (value: string | undefined): PairingState =>
  value === "shared" ? "shared" : "unpaired";

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
   * Persists pairing state without changing the Shared owner. The host's
   * in-person attestation writes `shared`. Showing a code does not call this.
   */
  setPairingState: (pairingState: PairingState) => Promise<void>;
}

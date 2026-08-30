import type { OwnerSecret } from "@evolu/common";

/** The two secrets the native keystore preserves for one installation. */
export interface OwnerSecrets {
  readonly deviceOwner: OwnerSecret;
  readonly sharedOwner: OwnerSecret;
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
}

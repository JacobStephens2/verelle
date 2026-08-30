import { inject, type InjectionKey } from "vue";

import type { OwnerManager } from "./owner-manager";

/** How the backup screen reaches the owner lifecycle without importing Evolu. */
export const ownerManagerKey: InjectionKey<OwnerManager> =
  Symbol("verelle.ownerManager");

export function useOwnerManager(): OwnerManager {
  const ownerManager = inject(ownerManagerKey);
  if (ownerManager === undefined) {
    throw new Error("No owner manager was provided at the app entry point");
  }
  return ownerManager;
}

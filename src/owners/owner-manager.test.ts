import {
  createOwnerSecret,
  createRandomBytes,
  ownerSecretToMnemonic,
  type OwnerSecret,
} from "@evolu/common";
import { describe, expect, it } from "vitest";

import { createOwnerManager } from "./owner-manager";
import type { OwnerSecretStore, OwnerSecrets } from "./owner-secret-store";

const newOwnerSecret = (): OwnerSecret =>
  createOwnerSecret({ randomBytes: createRandomBytes() });

class RestartableOwnerSecretStore implements OwnerSecretStore {
  constructor(
    private secrets: OwnerSecrets = {
      deviceOwner: newOwnerSecret(),
      sharedOwner: newOwnerSecret(),
    },
  ) {}

  async loadOrCreate(): Promise<OwnerSecrets> {
    return this.secrets;
  }

  async replaceSharedOwner(sharedOwner: OwnerSecret): Promise<void> {
    this.secrets = { ...this.secrets, sharedOwner };
  }
}

describe("owner lifecycle", () => {
  it("keeps the Device owner and Shared owner across a cold restart", async () => {
    const secretStore = new RestartableOwnerSecretStore();
    const beforeRestart = await createOwnerManager(secretStore).load();
    const afterRestart = await createOwnerManager(secretStore).load();

    expect(afterRestart.deviceOwner.id).toBe(beforeRestart.deviceOwner.id);
    expect(afterRestart.sharedOwner.id).toBe(beforeRestart.sharedOwner.id);
    expect(afterRestart.deviceOwner.id).not.toBe(afterRestart.sharedOwner.id);
  });

  it("restores the Shared owner on a fresh install from its recorded phrase alone", async () => {
    const recordedSecret = newOwnerSecret();
    const recordedPhrase = ownerSecretToMnemonic(recordedSecret);
    const freshInstallStore = new RestartableOwnerSecretStore();
    const freshInstall = createOwnerManager(freshInstallStore);
    const previousOwners = await freshInstall.load();

    expect(await freshInstall.restoreSharedOwner(recordedPhrase)).toEqual({ ok: true });

    const restoredOwners = await createOwnerManager(freshInstallStore).load();
    expect(restoredOwners.sharedOwner.id).not.toBe(previousOwners.sharedOwner.id);
    expect(restoredOwners.deviceOwner.id).toBe(previousOwners.deviceOwner.id);
    expect(restoredOwners.sharedOwnerMnemonic).toBe(recordedPhrase);
  });

  it("rejects an invalid restore phrase without replacing the Shared owner", async () => {
    const secretStore = new RestartableOwnerSecretStore();
    const ownerManager = createOwnerManager(secretStore);
    const before = await ownerManager.load();

    expect(await ownerManager.restoreSharedOwner("not a backup phrase")).toEqual({
      ok: false,
      message: "Enter all 24 words exactly as they were shown.",
    });

    const after = await createOwnerManager(secretStore).load();
    expect(after.sharedOwner.id).toBe(before.sharedOwner.id);
  });
});

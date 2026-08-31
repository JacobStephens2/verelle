import {
  createOwnerSecret,
  createRandomBytes,
  ownerSecretToMnemonic,
  type OwnerSecret,
} from "@evolu/common";
import { describe, expect, it } from "vitest";

import { createOwnerManager } from "./owner-manager";
import { pairingCodeFromSharedOwner } from "./pairing-code";
import type {
  OwnerSecretStore,
  OwnerSecrets,
  PairingState,
} from "./owner-secret-store";

const newOwnerSecret = (): OwnerSecret =>
  createOwnerSecret({ randomBytes: createRandomBytes() });

class RestartableOwnerSecretStore implements OwnerSecretStore {
  constructor(
    private secrets: OwnerSecrets = {
      deviceOwner: newOwnerSecret(),
      sharedOwner: newOwnerSecret(),
      pairingState: "unpaired",
    },
  ) {}

  async loadOrCreate(): Promise<OwnerSecrets> {
    return this.secrets;
  }

  async replaceSharedOwner(sharedOwner: OwnerSecret): Promise<void> {
    this.secrets = { ...this.secrets, sharedOwner };
  }

  async joinSharedOwner(sharedOwner: OwnerSecret): Promise<void> {
    this.secrets = { ...this.secrets, sharedOwner, pairingState: "shared" };
  }

  async markShared(): Promise<void> {
    this.secrets = { ...this.secrets, pairingState: "shared" };
  }

  pairingState(): PairingState {
    return this.secrets.pairingState;
  }

  sharedOwner(): OwnerSecret {
    return this.secrets.sharedOwner;
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
    expect(restoredOwners.pairingState).toBe("unpaired");
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
    expect(after.pairingState).toBe("unpaired");
  });

  it("carries the Shared owner from one phone to the other without the Relay", async () => {
    const hostStore = new RestartableOwnerSecretStore();
    const guestStore = new RestartableOwnerSecretStore();
    const host = createOwnerManager(hostStore);
    const guest = createOwnerManager(guestStore);
    const hostBefore = await host.load();
    const guestBefore = await guest.load();

    expect(hostBefore.pairingState).toBe("unpaired");
    expect(guestBefore.pairingState).toBe("unpaired");
    expect(guestBefore.sharedOwner.id).not.toBe(hostBefore.sharedOwner.id);

    const code = await host.shareChart();
    expect(code).toBe(pairingCodeFromSharedOwner(hostStore.sharedOwner()));
    expect((await host.load()).pairingState).toBe("unpaired");

    expect(await guest.joinSharedOwner(code)).toEqual({ ok: true });
    await host.markShared();
    expect((await host.load()).pairingState).toBe("shared");

    const guestAfter = await createOwnerManager(guestStore).load();
    expect(guestAfter.sharedOwner.id).toBe(hostBefore.sharedOwner.id);
    expect(guestAfter.deviceOwner.id).toBe(guestBefore.deviceOwner.id);
    expect(guestAfter.pairingState).toBe("shared");
  });

  it("rejects an invalid pairing code without joining this phone to another Chart", async () => {
    const guestStore = new RestartableOwnerSecretStore();
    const guest = createOwnerManager(guestStore);
    const before = await guest.load();

    expect(await guest.joinSharedOwner("not a pairing code")).toEqual({
      ok: false,
      message: "That pairing code is not valid. This phone is still on its own Chart.",
    });

    const after = await createOwnerManager(guestStore).load();
    expect(after.sharedOwner.id).toBe(before.sharedOwner.id);
    expect(after.pairingState).toBe("unpaired");
  });
});

import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const IOS_OWNER_PLUGIN = path.join(
  REPO_ROOT,
  "ios",
  "App",
  "App",
  "OwnerSecretsPlugin.swift",
);
const IOS_OWNER_TESTS = path.join(
  REPO_ROOT,
  "ios",
  "App",
  "AppTests",
  "OwnerSecretsKeychainTests.swift",
);

/** Mirrors `SharedOwnerRecord` in OwnerSecretsPlugin.swift. */
const VERSION = 1;
const SECRET_BYTES = 32;

const encodeRecord = (secret: Uint8Array, pairingState: string): Uint8Array => {
  const state = new TextEncoder().encode(pairingState);
  const encoded = new Uint8Array(1 + secret.length + state.length);
  encoded[0] = VERSION;
  encoded.set(secret, 1);
  encoded.set(state, 1 + secret.length);
  return encoded;
};

const asPairingState = (value: string | null | undefined): string =>
  value === "shared" ? "shared" : "unpaired";

const fromStored = (
  stored: Uint8Array,
  legacyPairingState: string | null,
): { secret: Uint8Array; pairingState: string; migrated: boolean } => {
  if (stored.length === SECRET_BYTES) {
    return {
      secret: stored,
      pairingState: asPairingState(legacyPairingState),
      migrated: true,
    };
  }
  expect(stored[0]).toBe(VERSION);
  const secret = stored.slice(1, 1 + SECRET_BYTES);
  const pairingState = asPairingState(
    new TextDecoder().decode(stored.slice(1 + SECRET_BYTES)),
  );
  return { secret, pairingState, migrated: false };
};

describe("the iOS bundled Shared owner record", () => {
  const secret = Uint8Array.from({ length: 32 }, (_, index) => index);

  it("round-trips the Shared owner and pairing state as one blob", () => {
    const encoded = encodeRecord(secret, "shared");
    expect(fromStored(encoded, null)).toEqual({
      secret,
      pairingState: "shared",
      migrated: false,
    });
  });

  it("migrates a 32-byte legacy Shared owner plus a split pairing-state item", () => {
    expect(fromStored(secret, "shared")).toEqual({
      secret,
      pairingState: "shared",
      migrated: true,
    });
    expect(fromStored(secret, null)).toEqual({
      secret,
      pairingState: "unpaired",
      migrated: true,
    });
  });

  it("fail-closes a leftover pending pairing state to unpaired", () => {
    expect(fromStored(encodeRecord(secret, "pending"), null)).toEqual({
      secret,
      pairingState: "unpaired",
      migrated: false,
    });
    expect(fromStored(secret, "pending")).toEqual({
      secret,
      pairingState: "unpaired",
      migrated: true,
    });
  });

  it("joins by writing that bundled record in one Keychain save", async () => {
    const ios = await readFile(IOS_OWNER_PLUGIN, "utf8");
    const joinAt = ios.indexOf("func joinSharedOwner");
    const nextFunc = ios.indexOf("\n    func ", joinAt + 1);
    const join = ios.slice(joinAt, nextFunc);

    expect(join.match(/try save\(/g)).toEqual(["try save("]);
    expect(join).toMatch(/pairingState:\s*"shared"/);
    expect(join).toMatch(/\.encode\(\)/);
    expect(ios).toMatch(/stored\.count == secretByteCount/);
    expect(ios).toMatch(/legacyPairingState/);
  });

  it("covers bundled and migrated Keychain state in an iOS test", async () => {
    const tests = await readFile(IOS_OWNER_TESTS, "utf8");
    expect(tests).toMatch(/joinSharedOwner/);
    expect(tests).toMatch(/seedLegacySharedOwner/);
    expect(tests).toMatch(/loadSharedOwnerRecord/);
  });
});

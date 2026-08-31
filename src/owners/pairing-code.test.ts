import { OwnerSecret } from "@evolu/common";
import jsQR from "jsqr";
import { encode as encodeQr } from "uqr";
import { describe, expect, it } from "vitest";

import {
  formatPairingCodeForDisplay,
  INVALID_PAIRING_CODE_MESSAGE,
  pairingCodeFromSharedOwner,
  parsePairingCode,
} from "./pairing-code";

/** Independently encoded: bytes 0..31, Crockford Base32 + CRC-16-CCITT. */
const WORKED_SECRET = OwnerSecret.orThrow(
  Uint8Array.from({ length: 32 }, (_, index) => index),
);
const WORKED_CODE = "V1000G40R40M30E209185GR38E1W8124GK2GAHC5RR34D1P70X3RFG4ESG";



describe("a pairing code", () => {
  it("encodes a Shared owner as a versioned, checksummed code", () => {
    expect(pairingCodeFromSharedOwner(WORKED_SECRET)).toBe(WORKED_CODE);
  });

  it("decodes the same Shared owner from the compact code or the displayed groups", () => {
    expect(parsePairingCode(WORKED_CODE)).toEqual({
      ok: true,
      sharedOwner: WORKED_SECRET,
    });
    expect(parsePairingCode(formatPairingCodeForDisplay(WORKED_CODE))).toEqual({
      ok: true,
      sharedOwner: WORKED_SECRET,
    });
  });

  it("accepts Crockford confusable characters without changing the Shared owner", () => {
    const withConfusables = WORKED_CODE.replace("000G", "OOOg");
    expect(parsePairingCode(withConfusables)).toEqual({
      ok: true,
      sharedOwner: WORKED_SECRET,
    });
  });

  it("rejects a corrupted, truncated, or unknown-version code without yielding a Shared owner", () => {
    const flipped = `${WORKED_CODE.slice(0, -1)}H`;
    expect(parsePairingCode(flipped)).toEqual({
      ok: false,
      message: INVALID_PAIRING_CODE_MESSAGE,
    });
    expect(parsePairingCode(WORKED_CODE.slice(0, 20))).toEqual({
      ok: false,
      message: INVALID_PAIRING_CODE_MESSAGE,
    });
    expect(parsePairingCode(`V2${WORKED_CODE.slice(2)}`)).toEqual({
      ok: false,
      message: INVALID_PAIRING_CODE_MESSAGE,
    });
    expect(parsePairingCode("not a pairing code")).toEqual({
      ok: false,
      message: INVALID_PAIRING_CODE_MESSAGE,
    });
  });

  it("decodes the same Shared owner from a QR of the pairing code", () => {
    const code = pairingCodeFromSharedOwner(WORKED_SECRET);
    const qr = encodeQr(code, { border: 2, ecc: "M" });
    const scale = 4;
    const width = qr.size * scale;
    const pixels = new Uint8ClampedArray(width * width * 4);
    for (let row = 0; row < qr.size; row += 1) {
      for (let column = 0; column < qr.size; column += 1) {
        const ink = qr.data[row]?.[column] === true ? 0 : 255;
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            const index = ((row * scale + dy) * width + (column * scale + dx)) * 4;
            pixels[index] = ink;
            pixels[index + 1] = ink;
            pixels[index + 2] = ink;
            pixels[index + 3] = 255;
          }
        }
      }
    }

    const detected = jsQR(pixels, width, width);
    expect(detected).not.toBeNull();
    expect(parsePairingCode(detected?.data ?? "")).toEqual({
      ok: true,
      sharedOwner: WORKED_SECRET,
    });
  });
});

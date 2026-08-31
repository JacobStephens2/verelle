import { OwnerSecret, type OwnerSecret as OwnerSecretValue } from "@evolu/common";

/**
 * The pairing-code shape: version `V1`, then Crockford Base32 of the 32-byte
 * Shared owner, then Crockford Base32 of a CRC-16-CCITT of those bytes.
 *
 * Camera and typing are the same payload. The code *is* the Shared owner, so
 * it never needs the Relay and must never be sent there.
 */
const VERSION = "V1";
const SECRET_BYTES = 32;
const CHECKSUM_BYTES = 2;
const SECRET_CHARS = 52;
const CHECKSUM_CHARS = 4;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const DECODE: Record<string, number> = Object.fromEntries(
  [...ALPHABET].map((character, index) => [character, index]),
);
DECODE.O = 0;
DECODE.I = 1;
DECODE.L = 1;

export const INVALID_PAIRING_CODE_MESSAGE =
  "That pairing code is not valid. This phone is still on its own Chart.";

export type PairingCodeParseResult =
  | { readonly ok: true; readonly sharedOwner: OwnerSecretValue }
  | { readonly ok: false; readonly message: string };

const fail = (): PairingCodeParseResult => ({
  ok: false,
  message: INVALID_PAIRING_CODE_MESSAGE,
});

function encodeCrockford(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += ALPHABET[(value >> bits) & 31];
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function decodeCrockford(
  characters: string,
  byteCount: number,
): Uint8Array | null {
  let bits = 0;
  let value = 0;
  const bytes = new Uint8Array(byteCount);
  let written = 0;
  for (const character of characters) {
    const digit = DECODE[character];
    if (digit === undefined) return null;
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      if (written >= byteCount) return null;
      bytes[written] = (value >> bits) & 0xff;
      written += 1;
    }
  }
  if (written !== byteCount) return null;
  if (bits > 0 && (value & ((1 << bits) - 1)) !== 0) return null;
  return bytes;
}

/** CRC-16-CCITT (poly 0x1021, init 0xFFFF), independent of any network stack. */
function checksum(bytes: Uint8Array): Uint8Array {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return Uint8Array.of(crc >> 8, crc & 0xff);
}

/** Encodes a Shared owner into the compact pairing code shown as QR or typed. */
export function pairingCodeFromSharedOwner(sharedOwner: OwnerSecretValue): string {
  return VERSION + encodeCrockford(sharedOwner) + encodeCrockford(checksum(sharedOwner));
}

const compactPairingInput = (input: string): string =>
  input.trim().replace(/[\s-]/gu, "").toUpperCase();

/** Groups the compact code for reading aloud, four characters at a time. */
export function formatPairingCodeForDisplay(code: string): string {
  const compact = compactPairingInput(code);
  const body = compact.startsWith(VERSION) ? compact.slice(VERSION.length) : compact;
  const groups = body.match(/.{1,4}/gu) ?? [];
  return [VERSION, ...groups].join(" ");
}

/** Parses a typed or scanned pairing code. Invalid input yields no Shared owner. */
export function parsePairingCode(input: string): PairingCodeParseResult {
  const compact = compactPairingInput(input);
  if (!compact.startsWith(VERSION)) return fail();
  const payload = compact.slice(VERSION.length);
  if (payload.length !== SECRET_CHARS + CHECKSUM_CHARS) return fail();

  const secret = decodeCrockford(payload.slice(0, SECRET_CHARS), SECRET_BYTES);
  const givenChecksum = decodeCrockford(payload.slice(SECRET_CHARS), CHECKSUM_BYTES);
  if (secret === null || givenChecksum === null) return fail();

  const expected = checksum(secret);
  if (expected[0] !== givenChecksum[0] || expected[1] !== givenChecksum[1]) {
    return fail();
  }

  return { ok: true, sharedOwner: OwnerSecret.orThrow(secret) };
}

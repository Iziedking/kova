import { bytesToHex, decodeBase58Bytes32, decodeUuid16, hexToBytes } from "./encoding";

const textEncoder = new TextEncoder();

function concatenate(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function bytes32FromHex(value: string, field: string): Uint8Array {
  const bytes = hexToBytes(value);
  if (bytes.length !== 32) throw new Error(`${field} must contain exactly 32 bytes.`);
  return bytes;
}

export function buildPickCommitmentPayload(input: { tableId: string; wallet: string; mint: string; saltHex: string }): Uint8Array {
  return concatenate([
    textEncoder.encode("KOVA_PICK_V1"),
    decodeUuid16(input.tableId),
    decodeBase58Bytes32(input.wallet),
    decodeBase58Bytes32(input.mint),
    bytes32FromHex(input.saltHex, "Salt"),
  ]);
}

export function buildSealedMarketPayload(input: { tableId: string; wallet: string; mint: string; pairMint: string; saltHex: string; rulesHashHex: string }): Uint8Array {
  return concatenate([
    textEncoder.encode("KOVA_MARKET_V1"),
    decodeUuid16(input.tableId),
    decodeBase58Bytes32(input.wallet),
    decodeBase58Bytes32(input.mint),
    decodeBase58Bytes32(input.pairMint),
    bytes32FromHex(input.saltHex, "Salt"),
    bytes32FromHex(input.rulesHashHex, "Rules hash"),
  ]);
}

export async function sha256Hex(payload: Uint8Array, subtle: SubtleCrypto = globalThis.crypto.subtle): Promise<string> {
  const ownedBuffer = Uint8Array.from(payload).buffer;
  return bytesToHex(new Uint8Array(await subtle.digest("SHA-256", ownedBuffer)));
}

export async function createPickCommitment(input: { tableId: string; wallet: string; mint: string; saltHex: string }): Promise<string> {
  return sha256Hex(buildPickCommitmentPayload(input));
}

export async function createSealedMarketHash(input: { tableId: string; wallet: string; mint: string; pairMint: string; saltHex: string; rulesHashHex: string }): Promise<string> {
  return sha256Hex(buildSealedMarketPayload(input));
}

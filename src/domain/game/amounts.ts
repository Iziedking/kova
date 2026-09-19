export type RawAmount = string;
export type Price18 = string;
export type SignedBps = string;

export const U64_MAX = 18_446_744_073_709_551_615n;
export const PRICE18_SCALE = 1_000_000_000_000_000_000n;
export const MAX_PRICE18 = 1_000_000_000_000_000_000_000_000n;

export function parseRawAmount(value: string, maximum = U64_MAX): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error("Raw amount must be a canonical non-negative integer string.");
  const amount = BigInt(value);
  if (amount > maximum) throw new Error("Raw amount exceeds the supported bound.");
  return amount;
}

export function parsePrice18(value: Price18): bigint {
  const amount = parseRawAmount(value, MAX_PRICE18);
  return amount;
}

export function decimalToPrice18(value: string): Price18 {
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.exec(value);
  if (match === null) throw new Error("Price must be an unsigned plain decimal string.");
  const fraction = match[2] ?? "";
  if (fraction.length > 18) throw new Error("Price precision exceeds 18 decimal places.");
  const scaled = BigInt(match[1]!) * PRICE18_SCALE + BigInt(fraction.padEnd(18, "0") || "0");
  if (scaled > MAX_PRICE18) throw new Error("Price exceeds the supported bound.");
  return scaled.toString();
}

export function checkedPot(stakeRaw: RawAmount, fundedPlayers: number): RawAmount {
  if (!Number.isSafeInteger(fundedPlayers) || fundedPlayers < 0) throw new Error("Funded player count must be a non-negative safe integer.");
  const pot = parseRawAmount(stakeRaw) * BigInt(fundedPlayers);
  if (pot > U64_MAX) throw new Error("Pot exceeds the u64 bound.");
  return pot.toString();
}

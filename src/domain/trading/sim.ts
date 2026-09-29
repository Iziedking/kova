/**
 * Trade mode on devnet: trades fill at the live DEX price with a DEX-like fee, against
 * a per-player virtual balance. No swap is sent. The ANSEM stake and payout stay real
 * (on-chain escrow); only the trading capital is simulated.
 *
 * Integer math throughout. Prices are USD with 18 decimals (the escrow program's
 * fixed point), cash is micro-USD, and quantities use SIM_DECIMALS so tokens priced
 * around $0.000003 keep full precision.
 */
export const STARTING_CASH_MICRO_USD = 10_000_000_000n; // $10,000
export const SIM_FEE_BPS = 30n; // 0.30%, a typical pump.fun / DEX swap fee
export const SIM_DECIMALS = 9;
export const PRICE_SCALE = 10n ** 18n;
/** Moves a quote more than this against the player and the fill is refused. */
export const MAX_ADVERSE_MOVE_BPS = 200n;
/** qty_raw * price18 / QTY_VALUE_DIVISOR = value in micro-USD. */
const QTY_VALUE_DIVISOR = 10n ** BigInt(SIM_DECIMALS + 18 - 6);
const BPS = 10_000n;

/** Exact parse of a decimal USD price string ("0.000003303") into 18-decimal fixed point. */
export function parsePrice18(usd: string): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(usd.trim());
  if (!match) throw new Error("Price is not a plain decimal.");
  const fraction = (match[2] ?? "").slice(0, 18).padEnd(18, "0");
  const price = BigInt(match[1]!) * PRICE_SCALE + BigInt(fraction);
  if (price <= 0n) throw new Error("Price must be positive.");
  return price;
}

export function valueMicroUsd(quantityRaw: bigint, price18: bigint): bigint {
  return quantityRaw * price18 / QTY_VALUE_DIVISOR;
}

export interface SimFill {
  quantityRaw: bigint;
  /** Notional at the fill price, before the fee. */
  quoteMicroUsd: bigint;
  feeMicroUsd: bigint;
}

/** Spend `inputMicroUsd` (fee included). */
export function buyFill(inputMicroUsd: bigint, price18: bigint): SimFill {
  if (inputMicroUsd <= 0n) throw new Error("Enter an amount above zero.");
  const feeMicroUsd = inputMicroUsd * SIM_FEE_BPS / BPS;
  const quoteMicroUsd = inputMicroUsd - feeMicroUsd;
  const quantityRaw = quoteMicroUsd * QTY_VALUE_DIVISOR / price18;
  if (quantityRaw <= 0n) throw new Error("That amount is too small to fill.");
  return { quantityRaw, quoteMicroUsd, feeMicroUsd };
}

/** Sell about `inputMicroUsd` worth; within 0.1% of the whole position sells all of it. */
export function sellFill(inputMicroUsd: bigint, price18: bigint, heldRaw: bigint): SimFill {
  if (inputMicroUsd <= 0n) throw new Error("Enter an amount above zero.");
  if (heldRaw <= 0n) throw new Error("You don't hold this token.");
  let quantityRaw = inputMicroUsd * QTY_VALUE_DIVISOR / price18;
  if (quantityRaw * 1000n >= heldRaw * 999n) quantityRaw = heldRaw;
  if (quantityRaw <= 0n) throw new Error("That amount is too small to fill.");
  const quoteMicroUsd = valueMicroUsd(quantityRaw, price18);
  return { quantityRaw, quoteMicroUsd, feeMicroUsd: quoteMicroUsd * SIM_FEE_BPS / BPS };
}

/** True when the live price moved against the player by more than the allowed slippage. */
export function movedAgainst(side: "buy" | "sell", quoted18: bigint, live18: bigint): boolean {
  return side === "buy" ? (live18 - quoted18) * BPS > quoted18 * MAX_ADVERSE_MOVE_BPS : (quoted18 - live18) * BPS > quoted18 * MAX_ADVERSE_MOVE_BPS;
}

export function equityMicroUsd(cashMicroUsd: bigint, positions: readonly { quantityRaw: bigint; price18: bigint }[]): bigint {
  return positions.reduce((total, position) => total + valueMicroUsd(position.quantityRaw, position.price18), cashMicroUsd);
}

/**
 * The value the escrow scores. Every trader starts at an index of 1.0 (PRICE_SCALE) and ends at
 * equity / starting cash, so the program's (end - start) / start is the portfolio return.
 */
export function portfolioIndex18(equity: bigint, startingCash: bigint = STARTING_CASH_MICRO_USD): bigint {
  const index = equity * PRICE_SCALE / startingCash;
  return index > 0n ? index : 1n;
}

export function pnlBps(equity: bigint, startingCash: bigint = STARTING_CASH_MICRO_USD): bigint {
  return (equity - startingCash) * BPS / startingCash;
}

/** Unknown marks invalidate the aggregate; zero quantities need no mark. */
export function markedEquityMicroUsd(cash: bigint, positions: readonly { quantityRaw: bigint; price18: bigint | null }[]): bigint | null {
  let total = cash;
  for (const position of positions) {
    if (position.quantityRaw === 0n) continue;
    if (position.price18 === null || position.price18 <= 0n) return null;
    total += valueMicroUsd(position.quantityRaw, position.price18);
  }
  return total;
}

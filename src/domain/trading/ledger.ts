import type { EquitySnapshot, MarkPrice, PositionState, TradeFill, TradingLedgerState } from "./types";
import { assertNonNegativeInteger, TradeFillSchema, MarkPriceSchema } from "./types";

const BPS_SCALE = 10_000n;

function positionValueMicroUsd(position: PositionState, mark: MarkPrice): bigint {
  const quantity = assertNonNegativeInteger(position.quantityRaw, "position quantity");
  const price = assertNonNegativeInteger(mark.priceMicroUsd, "mark price");
  return quantity * price / 10n ** BigInt(position.assetDecimals);
}

function signedRatioBps(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("Ratio denominator must be positive.");
  return numerator * BPS_SCALE / denominator;
}

export function createTradingLedger(input: {
  competitionId: string;
  playerId: string;
  accountId: string;
  startingCashMicroUsd: string;
}): TradingLedgerState {
  const startingCash = assertNonNegativeInteger(input.startingCashMicroUsd, "starting cash");
  if (startingCash <= 0n) throw new Error("Starting competition equity must be positive.");
  return {
    ...input,
    startingCashMicroUsd: startingCash.toString(),
    cashMicroUsd: startingCash.toString(),
    realizedPnlMicroUsd: "0",
    positions: [],
    fills: [],
  };
}

function replacePosition(positions: readonly PositionState[], assetMint: string, next: PositionState | null): readonly PositionState[] {
  const remaining = positions.filter((position) => position.assetMint !== assetMint);
  return next === null ? remaining : [...remaining, next];
}

export function applyTradeFill(state: TradingLedgerState, input: TradeFill): TradingLedgerState {
  const fill = TradeFillSchema.parse(input);
  if (fill.competitionId !== state.competitionId || fill.playerId !== state.playerId || fill.accountId !== state.accountId) {
    throw new Error("Trade fill does not belong to this isolated competition account.");
  }
  if (state.fills.some((existing) => existing.txSignature === fill.txSignature || existing.fillId === fill.fillId)) {
    throw new Error("Trade fill is already recorded.");
  }

  const quantity = BigInt(fill.quantityRaw);
  const quote = BigInt(fill.quoteAmountMicroUsd);
  const fee = BigInt(fill.feeMicroUsd);
  const current = state.positions.find((position) => position.assetMint === fill.assetMint);
  if (current && current.assetDecimals !== fill.assetDecimals) throw new Error("Asset decimals changed inside a competition.");

  if (fill.side === "buy") {
    const totalCost = quote + fee;
    const cash = BigInt(state.cashMicroUsd);
    if (totalCost > cash) throw new Error("Trade exceeds isolated competition cash.");
    const currentQuantity = current ? BigInt(current.quantityRaw) : 0n;
    const currentCost = current ? BigInt(current.costBasisMicroUsd) : 0n;
    return {
      ...state,
      cashMicroUsd: (cash - totalCost).toString(),
      positions: replacePosition(state.positions, fill.assetMint, {
        assetMint: fill.assetMint,
        assetDecimals: fill.assetDecimals,
        quantityRaw: (currentQuantity + quantity).toString(),
        costBasisMicroUsd: (currentCost + totalCost).toString(),
      }),
      fills: [...state.fills, fill],
    };
  }

  if (!current) throw new Error("Cannot sell an asset that is not held.");
  const currentQuantity = BigInt(current.quantityRaw);
  if (quantity > currentQuantity) throw new Error("Sell exceeds the isolated position.");
  const currentCost = BigInt(current.costBasisMicroUsd);
  const costSold = currentCost * quantity / currentQuantity;
  const proceeds = quote - fee;
  if (proceeds < 0n) throw new Error("Trade fee exceeds trade proceeds.");
  return {
    ...state,
    cashMicroUsd: (BigInt(state.cashMicroUsd) + proceeds).toString(),
    realizedPnlMicroUsd: (BigInt(state.realizedPnlMicroUsd) + proceeds - costSold).toString(),
    positions: replacePosition(state.positions, fill.assetMint, quantity === currentQuantity ? null : {
      ...current,
      quantityRaw: (currentQuantity - quantity).toString(),
      costBasisMicroUsd: (currentCost - costSold).toString(),
    }),
    fills: [...state.fills, fill],
  };
}

export function snapshotEquity(state: TradingLedgerState, marks: readonly MarkPrice[], asOf: string): EquitySnapshot {
  const parsedMarks = marks.map((mark) => MarkPriceSchema.parse(mark));
  const positionsValue = state.positions.reduce((total, position) => {
    const mark = parsedMarks.find((candidate) => candidate.assetMint === position.assetMint);
    if (!mark) throw new Error(`Missing mark price for ${position.assetMint}.`);
    if (mark.assetDecimals !== position.assetDecimals) throw new Error("Mark decimals do not match position decimals.");
    return total + positionValueMicroUsd(position, mark);
  }, 0n);
  const totalEquity = BigInt(state.cashMicroUsd) + positionsValue;
  const startingEquity = BigInt(state.startingCashMicroUsd);
  const totalPnl = totalEquity - startingEquity;
  const realized = BigInt(state.realizedPnlMicroUsd);
  return {
    asOf,
    cashMicroUsd: state.cashMicroUsd,
    positionsValueMicroUsd: positionsValue.toString(),
    totalEquityMicroUsd: totalEquity.toString(),
    realizedPnlMicroUsd: realized.toString(),
    unrealizedPnlMicroUsd: (totalPnl - realized).toString(),
    totalPnlMicroUsd: totalPnl.toString(),
    pnlBps: signedRatioBps(totalPnl, startingEquity).toString(),
  };
}

export function compareTradingResults(left: EquitySnapshot, right: EquitySnapshot): "left" | "right" | "tie" {
  const leftPnl = BigInt(left.totalPnlMicroUsd);
  const rightPnl = BigInt(right.totalPnlMicroUsd);
  return leftPnl === rightPnl ? "tie" : leftPnl > rightPnl ? "left" : "right";
}

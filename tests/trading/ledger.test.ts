import assert from "node:assert/strict";
import test from "node:test";
import { applyTradeFill, compareTradingResults, createTradingLedger, snapshotEquity } from "../../src/domain/trading/ledger";
import { validateTradeReconciliation } from "../../src/domain/trading/reconciliation";

const mint = "8wXtPeU6557ETkp9WHFY1n1EcU6NxDvbAggHGsMYiHsB";

function fill(side: "buy" | "sell", id: string, quantityRaw: string, quoteAmountMicroUsd: string, txSignature = id) {
  return { fillId: id, competitionId: "match-1", playerId: "player-a", accountId: "account-a", txSignature, side, assetMint: mint, assetDecimals: 2, quantityRaw, quoteAmountMicroUsd, feeMicroUsd: "100", observedAt: "2026-09-20T10:00:00.000Z" } as const;
}

test("ledger computes buy, sell, realized and mark-to-market PnL with integer math", () => {
  let ledger = createTradingLedger({ competitionId: "match-1", playerId: "player-a", accountId: "account-a", startingCashMicroUsd: "1000000" });
  ledger = applyTradeFill(ledger, fill("buy", "buy-1", "100", "500000"));
  ledger = applyTradeFill(ledger, fill("sell", "sell-1", "40", "240000"));
  const snapshot = snapshotEquity(ledger, [{ assetMint: mint, assetDecimals: 2, priceMicroUsd: "650000", observedAt: "2026-09-20T10:15:00.000Z" }], "2026-09-20T10:15:00.000Z");
  assert.equal(snapshot.cashMicroUsd, "739800");
  assert.equal(snapshot.positionsValueMicroUsd, "390000");
  assert.equal(snapshot.totalEquityMicroUsd, "1129800");
  assert.equal(snapshot.realizedPnlMicroUsd, "39860");
  assert.equal(snapshot.unrealizedPnlMicroUsd, "89940");
  assert.equal(snapshot.totalPnlMicroUsd, "129800");
  assert.equal(snapshot.pnlBps, "1298");
});

test("two players can trade the same mint without sharing accounting state", () => {
  const left = applyTradeFill(createTradingLedger({ competitionId: "match-1", playerId: "player-a", accountId: "account-a", startingCashMicroUsd: "1000000" }), fill("buy", "left-buy", "100", "500000", "left-tx"));
  const right = applyTradeFill(createTradingLedger({ competitionId: "match-1", playerId: "player-b", accountId: "account-b", startingCashMicroUsd: "1000000" }), { ...fill("buy", "right-buy", "100", "600000", "right-tx"), playerId: "player-b", accountId: "account-b" });
  const leftResult = snapshotEquity(left, [{ assetMint: mint, assetDecimals: 2, priceMicroUsd: "650000", observedAt: "2026-09-20T10:15:00.000Z" }], "2026-09-20T10:15:00.000Z");
  const rightResult = snapshotEquity(right, [{ assetMint: mint, assetDecimals: 2, priceMicroUsd: "650000", observedAt: "2026-09-20T10:15:00.000Z" }], "2026-09-20T10:15:00.000Z");
  assert.equal(compareTradingResults(leftResult, rightResult), "left");
});

test("ledger rejects overspending, overselling and duplicate signatures", () => {
  let ledger = createTradingLedger({ competitionId: "match-1", playerId: "player-a", accountId: "account-a", startingCashMicroUsd: "1000000" });
  assert.throws(() => applyTradeFill(ledger, fill("buy", "too-large", "100", "1000001")), /exceeds isolated competition cash/);
  ledger = applyTradeFill(ledger, fill("buy", "buy-1", "100", "500000"));
  assert.throws(() => applyTradeFill(ledger, fill("sell", "sell-too-large", "101", "600000")), /exceeds the isolated position/);
  assert.throws(() => applyTradeFill(ledger, fill("buy", "buy-2", "1", "1", "buy-1")), /already recorded/);
});

test("selling a full position removes it from the ledger", () => {
  let ledger = createTradingLedger({ competitionId: "match-1", playerId: "player-a", accountId: "account-a", startingCashMicroUsd: "1000000" });
  ledger = applyTradeFill(ledger, fill("buy", "buy-full", "100", "500000"));
  ledger = applyTradeFill(ledger, fill("sell", "sell-full", "100", "500000"));
  assert.deepEqual(ledger.positions, []);
});

test("reconciliation accepts only a confirmed receipt for the exact wallet and signature", () => {
  const receipt = { txSignature: "tx-1", walletAddress: "wallet-1", slot: 42, status: "confirmed" as const, observedAt: "2026-09-20T10:15:00.000Z", source: "helius" as const };
  assert.deepEqual(validateTradeReconciliation({ expectedSignature: "tx-1", expectedWalletAddress: "wallet-1", receipt }), { ok: true, receipt });
  assert.deepEqual(validateTradeReconciliation({ expectedSignature: "tx-2", expectedWalletAddress: "wallet-1", receipt }), { ok: false, code: "SIGNATURE_MISMATCH" });
  assert.deepEqual(validateTradeReconciliation({ expectedSignature: "tx-1", expectedWalletAddress: "wallet-2", receipt }), { ok: false, code: "WALLET_MISMATCH" });
  assert.deepEqual(validateTradeReconciliation({ expectedSignature: "tx-1", expectedWalletAddress: "wallet-1", receipt: { ...receipt, status: "unknown" } }), { ok: false, code: "TRANSACTION_NOT_CONFIRMED" });
});

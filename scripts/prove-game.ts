import assert from "node:assert/strict";
import { decimalToPrice18 } from "../src/domain/game/amounts";
import { createPickCommitment, createSealedMarketHash } from "../src/domain/game/commitment";
import { allocatePot, settleEqualStakeRound } from "../src/domain/game/scoring";
import { draftTable, reduceTable, type TableRuntime } from "../src/domain/game/state";
import { getGameCapabilities } from "../src/backend/game/fixtures";

const ZERO_WALLET = "11111111111111111111111111111111";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const vector = {
  tableId: "018f7f5e-7b1a-4d40-8a41-8dd5f8108f02",
  wallet: ZERO_WALLET,
  mint: TOKEN_PROGRAM,
  pairMint: "So11111111111111111111111111111111111111112",
  saltHex: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  rulesHashHex: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
} as const;

async function main(): Promise<void> {
  const pickCommitment = await createPickCommitment(vector);
  const sealedMarketHash = await createSealedMarketHash(vector);
  assert.equal(pickCommitment, "08a068f87b3ecba7716b36d8b1f1991f85c32815cc5c64c33d54a5df618c2e97");
  assert.equal(sealedMarketHash, "a6dfd8667fc06c64b773c5c7c997189a12b9fc08874439d2aa2b7f503416e93d");

  const settlement = settleEqualStakeRound("100", [
    { wallet: ZERO_WALLET, startPrice18: decimalToPrice18("10"), endPrice18: decimalToPrice18("12") },
    { wallet: TOKEN_PROGRAM, startPrice18: decimalToPrice18("20"), endPrice18: decimalToPrice18("24") },
  ]);
  assert.equal(settlement.scores.reduce((sum, score) => sum + BigInt(score.awardRaw), 0n), 200n);
  const tieAwards = allocatePot("101", [TOKEN_PROGRAM, ZERO_WALLET]);
  assert.deepEqual(Object.fromEntries(tieAwards), { [ZERO_WALLET]: "51", [TOKEN_PROGRAM]: "50" });

  const settling: TableRuntime = { ...draftTable(), status: "SETTLING", financialStatus: "funded", fundedPlayerCount: 2, settlementDeadlineMs: 1_000 };
  const finalizationAtDeadline = reduceTable(settling, { type: "FINALIZE" }, { nowMs: 1_000, source: "test" });
  const refundAtDeadline = reduceTable(settling, { type: "TIMEOUT" }, { nowMs: 1_000, source: "test" });
  assert.equal(finalizationAtDeadline.ok, false);
  assert.equal(refundAtDeadline.ok, true);

  console.log(JSON.stringify({
  schemaVersion: "kova-game-proof-v1",
  capabilities: getGameCapabilities(),
  vectors: {
    pickCommitment,
    sealedMarketHash,
    scoreBps: settlement.scores.map(({ wallet, scoreBps }) => ({ wallet, scoreBps })),
    tieAwards: Object.fromEntries(tieAwards),
  },
  boundary: {
    finalizationAtDeadline,
    refundAtDeadline,
  },
  proves: "KOVA's integer score, byte-canonical commitment, deterministic tie allocation, state deadline, public fixture, local-program capability boundary, and refusal contracts execute without credentials.",
  doesNotProve: "Dealer isolation, private persistence, live price marks, canonical ANSEM identity, approved-network program deployment, production payout execution, or legal availability.",
  }, null, 2));
}

void main();

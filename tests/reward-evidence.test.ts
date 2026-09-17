import assert from "node:assert/strict";
import test from "node:test";
import { buildRewardEvidenceReport, type RewardEvidenceInput } from "../src/domain/reward-evidence";
import { PHASE00_CANDIDATE } from "../src/domain/phase00-feasibility";

const baseInput: RewardEvidenceInput = {
  market: PHASE00_CANDIDATE,
  poolOwner: "5CEbueQnq1Ym2uSSx2xXds3jQAqT1BDnkA59RZobSPAG",
  rewardSlots: [],
  initializedSlots: [],
  availableSlot: 0,
  ansem: { mint: null, status: "unknown", source: null },
  authority: { poolOwnerVerified: false, rewardFunder: null, authorityVerified: false, source: null },
  funding: { status: "unknown", source: null },
  observedSlot: 447300000,
  observedAt: "2026-09-15T12:00:00.000Z",
  source: "solana_rpc",
};

test("empty reward slots do not become ANSEM evidence", () => {
  const result = buildRewardEvidenceReport(baseInput);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.canonicalAnsemMint, null);
  assert.equal(result.value.ansemStatus, "unknown");
  assert.equal(result.value.scheduleStatus, "empty");
  assert.equal(result.value.availableSlot, 0);
  assert.match(result.value.blockers.join(" "), /ANSEM/);
});

test("overall status stays unknown while any evidence blocker is present, never optimistic capture", () => {
  const result = buildRewardEvidenceReport(baseInput);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.notEqual(result.value.blockers.length, 0);
  assert.equal(result.value.status, "unknown");
});

test("pool owner is not treated as reward authority", () => {
  const result = buildRewardEvidenceReport({ ...baseInput, authority: { ...baseInput.authority, rewardFunder: baseInput.poolOwner } });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.authority.poolOwnerVerified, false);
  assert.equal(result.value.authority.authorityVerified, false);
  assert.match(result.value.doesNotProve.join(" "), /reward authority/);
});

test("a reward vault balance does not prove campaign funding", () => {
  const result = buildRewardEvidenceReport({
    ...baseInput,
    rewardSlots: [{
      slot: 0,
      state: 1,
      rewardMint: "11111111111111111111111111111111",
      rewardVault: "22222222222222222222222222222222",
      creator: "33333333333333333333333333333333",
      openTime: "1720000000",
      endTime: "1721000000",
      emissionsPerSecondX64: "18446744073709551616",
      totalEmittedRaw: "1000",
      claimedRaw: "100",
      vaultBalanceRaw: "900",
      vaultMint: "11111111111111111111111111111111",
      vaultOwner: "44444444444444444444444444444444",
      tokenProgramId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      tokenDecimals: 9,
    }],
    initializedSlots: [0],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.rewardSlots[0]?.vaultBalanceRaw, "900");
  assert.equal(result.value.fundingStatus, "unknown");
  assert.match(result.value.blockers.join(" "), /funding/);
});

test("invalid reward state cannot cross the pure evidence boundary", () => {
  const result = buildRewardEvidenceReport({ ...baseInput, observedSlot: 0 });
  assert.deepEqual(result, {
    ok: false,
    code: "INVALID_REWARD_EVIDENCE_INPUT",
    message: "Reward evidence requires a positive slot and valid observation time.",
    retryable: false,
  });
});

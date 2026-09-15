import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPhase00Report,
  isPhase00Ready,
  PHASE00_CANDIDATE,
  simulatePositionPlan,
} from "../src/domain/phase00-feasibility";

test("phase 00 binds the candidate to exact pool, program and token authorities", () => {
  assert.equal(PHASE00_CANDIDATE.pool, "Ak7oAUqQ9jYu5YvfmDrtDC3WHi7BcN5Y4k8Bh3yk4B5e");
  assert.equal(PHASE00_CANDIDATE.programId, "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK");
  assert.deepEqual(
    [PHASE00_CANDIDATE.token0.mint, PHASE00_CANDIDATE.token0.programId, PHASE00_CANDIDATE.token0.decimals],
    ["Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", 8],
  );
  assert.deepEqual(
    [PHASE00_CANDIDATE.token1.mint, PHASE00_CANDIDATE.token1.programId, PHASE00_CANDIDATE.token1.decimals],
    ["Aigf5pKPyZW8nzxCrHEisE4tZMiUhFpKie8mYE7cmj6c", "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", 9],
  );
});

test("phase 00 fails closed while reward authority and live tick evidence are missing", () => {
  const report = buildPhase00Report();
  assert.equal(report.status, "blocked");
  assert.equal(report.reward.canonicalAnsemMint, null);
  assert.equal(report.poolOwnerVerified, false);
  assert.equal(isPhase00Ready(report), false);
  assert.equal(report.gates.find((gate) => gate.id === "reward_authority_and_ansem")?.status, "blocked");
});

test("the position path is a user-owned simulation plan, never an executable operation", () => {
  const plan = simulatePositionPlan();
  assert.equal(plan.mode, "simulate_only");
  assert.equal(plan.executable, false);
  assert.equal(plan.steps.find((step) => step.id === "prepare_open")?.signer, "user_wallet");
  assert.equal(plan.steps.find((step) => step.id === "prepare_withdraw")?.signer, "user_wallet");
  assert.match(plan.blockers.join(" "), /unsigned transaction/i);
});

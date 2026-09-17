import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLattice,
  depthCurve,
  proximityBoost,
  sweepX,
  LATTICE_GAP,
  LATTICE_REACH,
  SWEEP_PERIOD_MS,
} from "../src/design/lattice";

test("buildLattice fills the box on the given gap", () => {
  const nodes = buildLattice(100, 100, 50, () => 0.5);
  assert.equal(nodes.length, 4);
  assert.deepEqual(nodes.map((node) => node.x), [25, 75, 25, 75]);
  assert.deepEqual(nodes.map((node) => node.y), [25, 25, 75, 75]);
});

test("buildLattice returns nothing for a zero or negative box", () => {
  assert.equal(buildLattice(0, 100, 50).length, 0);
  assert.equal(buildLattice(100, -1, 50).length, 0);
});

test("buildLattice refuses a non-positive gap instead of looping forever", () => {
  assert.equal(buildLattice(100, 100, 0).length, 0);
  assert.equal(buildLattice(100, 100, -5).length, 0);
});

test("depthCurve is deepest at the left edge and decays rightward", () => {
  const left = Math.abs(depthCurve(0, 100, 20));
  const right = Math.abs(depthCurve(100, 100, 20));
  assert.ok(left > right, "left edge must carry more amplitude than the right");
});

test("depthCurve is bounded by the amplitude across the whole span", () => {
  for (let x = 0; x <= 100; x += 5) {
    assert.ok(Math.abs(depthCurve(x, 100, 20)) <= 20, `overshoot at x=${x}`);
  }
});

test("depthCurve clamps beyond the box instead of diverging", () => {
  assert.equal(depthCurve(-50, 100, 20), depthCurve(0, 100, 20));
  assert.equal(depthCurve(500, 100, 20), depthCurve(100, 100, 20));
});

test("depthCurve tolerates a zero-width box", () => {
  assert.equal(depthCurve(10, 0, 20), 0);
});

test("proximityBoost is 1 at the pointer and 0 at the reach", () => {
  assert.equal(proximityBoost(0, 0, 150), 1);
  assert.equal(proximityBoost(150, 0, 150), 0);
  assert.equal(proximityBoost(400, 0, 150), 0);
});

test("proximityBoost is 0 when reach is not positive", () => {
  assert.equal(proximityBoost(0, 0, 0), 0);
  assert.equal(proximityBoost(0, 0, -10), 0);
});

test("sweepX crosses the width once per period", () => {
  assert.equal(sweepX(0, 800, 14000), 0);
  assert.equal(sweepX(7000, 800, 14000), 400);
  assert.equal(sweepX(14000, 800, 14000), 0);
});

test("sweepX tolerates a non-positive period", () => {
  assert.equal(sweepX(1000, 800, 0), 0);
});

test("the spec's lattice constants are the ones section 6.1 fixes", () => {
  assert.equal(SWEEP_PERIOD_MS, 14000);
  assert.equal(LATTICE_GAP, 34);
  assert.equal(LATTICE_REACH, 150);
});

import test from "node:test";
import assert from "node:assert/strict";
import { approach, LENIS_LERP } from "../src/design/motion";

test("approach moves a fraction of the remaining distance", () => {
  assert.equal(approach(0, 10, 0.1), 1);
  assert.equal(approach(10, 10, 0.1), 10);
});

test("approach snaps when within the epsilon", () => {
  assert.equal(approach(9.9999, 10, 0.1), 10);
});

test("approach converges rather than oscillating", () => {
  let current = 0;
  for (let i = 0; i < 400; i += 1) current = approach(current, 3, 0.1);
  assert.equal(current, 3);
});

test("smooth scroll stays gentle enough to read against", () => {
  assert.ok(LENIS_LERP > 0 && LENIS_LERP <= 0.2);
});

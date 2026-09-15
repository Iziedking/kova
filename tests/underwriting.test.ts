import assert from "node:assert/strict";
import test from "node:test";
import { underwritePreview } from "../src/application/underwriting";

test("underwriting refuses unknown market identities", () => {
  const result = underwritePreview({ marketId: "unknown", amountUsdMicro: "1000000" }, "2026-09-15T00:00:00.000Z");
  assert.equal(result.kind, "refuse");
});

test("underwriting never upgrades a captured snapshot to an execution approval", () => {
  const result = underwritePreview({ marketId: "nvdge-nvdax", amountUsdMicro: "1000000" }, "2026-09-15T00:00:00.000Z");
  assert.equal(result.kind, "wait");
  if (result.kind === "wait") assert.match(result.reasons[0], /live oracle/i);
});

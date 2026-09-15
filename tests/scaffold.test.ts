import assert from "node:assert/strict";
import test from "node:test";
import { getCapabilities, refuseTransactionPreparation } from "../src/application/capabilities";
import { POST } from "../src/app/api/operations/prepare/route";

test("the scaffold exposes no signing or paid capability", () => {
  const capabilities = getCapabilities().capabilities;
  assert.equal(capabilities.marketReads, "captured_snapshot");
  assert.equal(capabilities.campaigns, "captured_snapshot");
  assert.equal(capabilities.underwriting, "preview_only");
  for (const key of ["paidResearch", "transactionPreparation", "walletSigning", "automatedRebalancing"] as const) assert.equal(capabilities[key], "unavailable");
});
test("transaction preparation refuses before consuming an intent", async () => {
  const response = POST();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), refuseTransactionPreparation());
});

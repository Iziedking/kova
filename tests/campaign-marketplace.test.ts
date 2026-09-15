import assert from "node:assert/strict";
import test from "node:test";
import { CAMPAIGN_CATALOG } from "../src/domain/campaign-catalog";
import { buildCampaignFeed, transitionCampaign, validateBackingIntent } from "../src/domain/campaign-marketplace";

test("campaign feed exposes progress and keeps ANSEM unverified", () => {
  const [card] = buildCampaignFeed(CAMPAIGN_CATALOG);
  assert.equal(card?.backingProgressBps, 4050);
  assert.equal(card?.ansem.status, "unverified");
  assert.equal(card?.ranking.status, "preview_only");
});

test("campaign state machine rejects skipping the review boundary", () => {
  const result = transitionCampaign("seeking_interest", "active");
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "INVALID_CAMPAIGN_TRANSITION");
});

test("backing intent uses integer USD micro-units and a stable operation key", () => {
  const accepted = validateBackingIntent({ operationKey: "backing:nvdge:01", campaignId: "campaign-nvdge-week-01", wallet: "11111111111111111111111111111111", amountUsdMicro: "500000000", state: "pending" });
  assert.equal(accepted.ok, true);
  const rejected = validateBackingIntent({ operationKey: "short", campaignId: "campaign-nvdge-week-01", wallet: "11111111111111111111111111111111", amountUsdMicro: "0.5", state: "pending" });
  assert.equal(rejected.ok, false);
});

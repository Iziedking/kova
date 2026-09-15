import assert from "node:assert/strict";
import test from "node:test";
import { CAMPAIGN_CATALOG, campaignById } from "../src/domain/campaign-catalog";

test("campaign previews reference only discovered markets and keep reward mint provisional", () => {
  assert.equal(CAMPAIGN_CATALOG.length, 2);
  assert.ok(CAMPAIGN_CATALOG.every((campaign) => campaign.rewardMint === "ANSEM_PENDING_MINT"));
  assert.equal(campaignById("campaign-nvdge-week-01")?.marketId, "nvdge-nvdax");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { CHIP } from "../../src/adapters/near/chip";
import { SHARE_TAGS, burnLine, invitePost, movePct, resultLine, showdownPost, xPostUrl } from "../../src/adapters/near/share";

const HOUSE = "house.kingizie.testnet";
const seat = (player: string, market: string, bps: number, award: number) => ({ player, market, score_bps: bps, award: BigInt(award) * CHIP });

test("the result is told from the viewer's seat", () => {
  const seats = [seat(HOUSE, "near:zec.omft.near", 70, 90), seat("kingizie.testnet", "near:wrap.near", -30, 0)];
  assert.equal(resultLine("4", seats, "kingizie.testnet", HOUSE), "The House beat me at table 4 on Kova: ZEC +0.70% against my wNEAR -0.30%.");
  const won = [seat(HOUSE, "near:zec.omft.near", -16, 0), seat("kingizie.testnet", "near:zec.omft.near", 1, 45)];
  assert.equal(resultLine("3", won, "kingizie.testnet", HOUSE), "I beat the House at table 3 on Kova: my ZEC +0.01% against ZEC -0.16%.");
  // A visitor who did not play reads names.
  assert.equal(resultLine("4", seats, null, HOUSE), "The House won table 4 on Kova with ZEC +0.70% against 1 player.");
});

test("ties, multi-seat tables and implicit accounts read cleanly", () => {
  const tie = [seat(HOUSE, "near:zec.omft.near", -17, 90), seat("kingizie.testnet", "near:zec.omft.near", -17, 90)];
  assert.equal(resultLine("5", tie, "kingizie.testnet", HOUSE), "Tie at table 5 on Kova: the House and I split the pot at -0.17% (ZEC and ZEC).");
  const hex = "98793cd91a3f870fb126f66285808c7e094afcfc4eda8a970f6648cdf0dbd6de";
  const four = [seat(hex, "near:wrap.near", 40, 180), seat("ada.testnet", "near:zec.omft.near", 10, 0), seat("bob.testnet", "near:wrap.near", -5, 0), seat("cy.testnet", "near:zec.omft.near", 0, 0)];
  assert.equal(resultLine("9", four, "ada.testnet", HOUSE), "98793c…d6de won table 9 on Kova with wNEAR +0.40% against 3 players.");
});

test("the post carries the burn, the supply and the hackathon tags, and the link rides separately", () => {
  const seats = [seat(HOUSE, "near:zec.omft.near", -17, 90), seat("kingizie.testnet", "near:zec.omft.near", -17, 90)];
  const post = showdownPost({ tableId: "5", seats, viewer: "kingizie.testnet", house: HOUSE, burned: 20n * CHIP, supply: 1_049_950n * CHIP });
  assert.match(post, /This pot burned 20 CHIP\. Supply is now 1,049,950\./);
  assert.ok(post.endsWith(SHARE_TAGS));
  assert.match(SHARE_TAGS, /Built at NEAR HACKATHON/);
  assert.match(SHARE_TAGS, /@NEARProtocol/);
  assert.match(SHARE_TAGS, /#NEARHackathon/);
  // An X post is 280 characters; a link counts as 23.
  assert.ok(post.length + 24 <= 280, `post is ${post.length} characters`);
  const url = new URL(xPostUrl(post, "https://near.kova.surf/t/5"));
  assert.equal(url.origin + url.pathname, "https://x.com/intent/tweet");
  assert.equal(url.searchParams.get("text"), post);
  assert.equal(url.searchParams.get("url"), "https://near.kova.surf/t/5");
  assert.equal(burnLine(5n * CHIP, null), "This pot burned 5 CHIP.");
  assert.equal(movePct(null), "n/a");
});

test("an invite post fits in one post with its link", () => {
  const post = invitePost({ tableId: "123456", stake: 100n * CHIP, roundSeconds: 300 });
  assert.match(post, /table 123456/);
  assert.ok(post.endsWith(SHARE_TAGS));
  assert.ok(post.length + 24 <= 280, `post is ${post.length} characters`);
});

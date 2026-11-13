import assert from "node:assert/strict";
import { test } from "node:test";
import { CHIP, type ChipTable } from "../../src/adapters/near/chip";
import { callMarket, isLaunchMarket, launchLabel, launchOf, launchUrl, parseCall } from "../../src/adapters/near/launch-calls";
import { buildScouts, serializeScouts } from "../../src/adapters/near/leaderboard";
import { SHARE_TAGS, launchPost, scoutLine, symbolOf } from "../../src/adapters/near/share";

const HOUSE = "house.kingizie.testnet";
const JAMBO = "near:jambo-1679.meme-cooking.near";
const COOKS = "mc:2320:BLYA64:cooks";
const FLOPS = "mc:2320:BLYA64:flops";

test("call markets carry the auction, the symbol and the side, and nothing else parses as one", () => {
  assert.equal(callMarket(2320, "BLYA64", "cooks"), COOKS);
  assert.deepEqual(parseCall(FLOPS), { memeId: 2320, symbol: "BLYA64", side: "flops" });
  for (const bad of ["mc:2320:cooks", "mc:x:BLYA64:cooks", "mc:2320:BLY A:cooks", "mc:2320:BLYA64:maybe", "near:wrap.near", ""]) assert.equal(parseCall(bad), null, bad);
  assert.throws(() => callMarket(1, "has space", "cooks"));
  assert.ok(callMarket(1, "X".repeat(24), "flops").length <= 96, "fits the contract's market length");
});

test("a launch pick is a call or a token launched on meme.cooking; other coins are not", () => {
  assert.deepEqual(launchOf(JAMBO), { memeId: 1679, symbol: "JAMBO", kind: "token" });
  assert.equal(launchOf(COOKS)?.kind, "call");
  assert.ok(isLaunchMarket(JAMBO) && isLaunchMarket(COOKS));
  assert.ok(!isLaunchMarket("near:wrap.near") && !isLaunchMarket("near:token.0xshitzu.near") && !isLaunchMarket(null));
  assert.equal(launchLabel(COOKS), "BLYA64 cooks");
  assert.equal(launchUrl(JAMBO), "https://meme.cooking/meme/1679");
  assert.equal(symbolOf(FLOPS), "BLYA64 flops");
});

function seated(id: number, stakeChip: number, seats: [string, string, number][]): ChipTable {
  const stake = BigInt(stakeChip) * CHIP;
  const pot = stake * BigInt(seats.length);
  return {
    id: String(id), host: HOUSE, stake, seats: seats.length, round_seconds: 300, status: "Settled",
    opened_at: 0, open_until: 0, locked_at: 0, start_deadline: 0, starts_at: 0, ends_at: 0, settle_deadline: 0,
    pot, burned: pot / 10n, winners: seats.filter(([, , a]) => a > 0).length,
    players: seats.map(([player, market, award]) => ({ player, commitment: "c", market, start_price: null, end_price: null, score_bps: 120, award: BigInt(award) * CHIP })),
  };
}

test("launch scouts count only meme.cooking seats, ranked by pots taken, then net", () => {
  const tables = [
    seated(1, 25, [[HOUSE, "near:wrap.near", 0], ["ada.testnet", JAMBO, 45]]),
    seated(2, 25, [[HOUSE, FLOPS, 45], ["ada.testnet", COOKS, 0]]),
    seated(3, 25, [[HOUSE, "near:zec.omft.near", 45], ["bob.testnet", "near:wrap.near", 0]]),
    seated(4, 10, [["bob.testnet", COOKS, 9], ["cy.testnet", COOKS, 9]]),
    { ...seated(5, 25, [[HOUSE, JAMBO, 0], ["cy.testnet", JAMBO, 0]]), status: "Voided" as const },
  ];
  const scouts = buildScouts(tables, HOUSE, isLaunchMarket);
  assert.deepEqual(scouts.map((s) => [s.player, s.rank, s.called, s.splits, s.calls, s.net]), [
    // ada: took table 1 (+20), lost table 2 (-25).
    [HOUSE, 1, 1, 0, 1, 20n * CHIP],
    ["ada.testnet", 2, 1, 0, 2, -5n * CHIP],
    // bob and cy split table 4 (-1 each); table 3 had no launch pick and table 5 was refunded.
    ["bob.testnet", 3, 0, 1, 1, -1n * CHIP],
    ["cy.testnet", 3, 0, 1, 1, -1n * CHIP],
  ]);
  assert.equal(scouts.find((s) => s.player === "ada.testnet")?.lastMarket, COOKS);
  assert.equal(serializeScouts(scouts)[0].net, (20n * CHIP).toString());
});

const seat = (player: string, market: string, bps: number, award: number) => ({ player, market, score_bps: bps, award: BigInt(award) * CHIP });

test("a winning launch pick reads as a call, names meme.cooking's account, and links to back it", () => {
  const cooked = [seat("ada.testnet", COOKS, 10_000, 45), seat(HOUSE, FLOPS, 0, 0)];
  assert.equal(scoutLine("12", cooked, "ada.testnet", HOUSE), "I called BLYA64 before it cooked on @memedotcooking, and beat the House at table 12 on Kova.");
  const flopped = [seat("ada.testnet", FLOPS, 10_000, 45), seat("bob.testnet", COOKS, 0, 0)];
  assert.equal(scoutLine("13", flopped, "ada.testnet", HOUSE), "I called it: BLYA64 did not cook on @memedotcooking. I beat bob.testnet at table 13 on Kova.");
  const token = [seat("ada.testnet", JAMBO, 120, 45), seat(HOUSE, "near:zec.omft.near", 30, 0)];
  assert.equal(scoutLine("14", token, "ada.testnet", HOUSE), "I called JAMBO, a @memedotcooking launch: +1.20%, and beat the House at table 14 on Kova.");
  // A loss, an ordinary coin, or a visitor gets the ordinary card.
  assert.equal(scoutLine("12", cooked, "house.kingizie.testnet", HOUSE), null);
  assert.equal(scoutLine("15", [seat("ada.testnet", "near:wrap.near", 50, 45), seat(HOUSE, JAMBO, 0, 0)], "ada.testnet", HOUSE), null);
  assert.equal(scoutLine("12", cooked, null, HOUSE), null);

  const post = launchPost({ tableId: "12", seats: cooked, viewer: "ada.testnet", house: HOUSE, burned: 5n * CHIP });
  assert.ok(post);
  assert.match(post, /This pot burned 5 CHIP\./);
  assert.match(post, /Back it: https:\/\/meme\.cooking\/meme\/2320/);
  assert.ok(post.endsWith(SHARE_TAGS) && post.includes("@NEARProtocol") && post.includes("#NEARHackathon") && post.includes("@memedotcooking"));
});

test("the longest launch post fits in 280 characters, counting each link as 23", () => {
  const hex = "98793cd91a3f870fb126f66285808c7e094afcfc4eda8a970f6648cdf0dbd6de";
  const long = "Q".repeat(24);
  for (const side of ["cooks", "flops"] as const) {
    const seats = [seat(hex, `mc:999999999:${long}:${side}`, 10_000, 1_000), seat(hex.replace("9", "8"), `mc:999999999:${long}:${side === "cooks" ? "flops" : "cooks"}`, 0, 0)];
    const post = launchPost({ tableId: "999999999999", seats, viewer: hex, house: HOUSE, burned: 1_000n * CHIP });
    assert.ok(post);
    // X counts every URL as 23 characters: the inline meme.cooking link and the table link it carries.
    const counted = post.replace(/https:\/\/\S+/g, "x".repeat(23)).length + 1 + 23;
    assert.ok(counted <= 280, `${side}: ${counted} characters`);
  }
});

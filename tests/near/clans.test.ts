import assert from "node:assert/strict";
import { test } from "node:test";
import { type ChipClient, isClanName } from "../../src/adapters/near/chip";
import { SHARE_TAGS } from "../../src/adapters/near/share";
import { clanInvitePost, readClanRace } from "../../src/features/near/clans";

test("clan names follow the contract's rule", () => {
  for (const ok of ["red", "lagos-sharks", "a1b", "x".repeat(24)]) assert.ok(isClanName(ok), ok);
  for (const bad of ["ab", "Red", "red team", "-red", "red-", "x".repeat(25), "", "red_team"]) assert.ok(!isClanName(bad), bad);
});

test("the clan race ranks by tables and puts the contract's leader first among equals", async () => {
  const clans = [
    { name: "blue", founder: "b.testnet", created_at: 2, members: 3 },
    { name: "red", founder: "a.testnet", created_at: 1, members: 2 },
    { name: "green", founder: "c.testnet", created_at: 3, members: 1 },
  ];
  const tally: Record<string, { tables: number; players: number }> = { blue: { tables: 2, players: 2 }, red: { tables: 2, players: 1 }, green: { tables: 0, players: 0 } };
  const chip = {
    getClans: async () => clans,
    getClanDay: async (_day: number, name: string) => tally[name],
  } as unknown as ChipClient;
  // Red got to 2 first, so the contract says red leads the 2-2 tie.
  const race = await readClanRace(chip, 20770, "red");
  assert.deepEqual(race.map((r) => [r.name, r.rank, r.top]), [["red", 1, true], ["blue", 2, false], ["green", 3, false]]);
  // With no leader recorded, equal tables share a rank.
  const open = await readClanRace(chip, 20770, null);
  assert.deepEqual(open.map((r) => r.rank), [1, 1, 3]);
});

test("a clan invite post carries the hackathon tags and fits with its link", () => {
  const post = clanInvitePost("a-twenty-four-char-clan1");
  assert.ok(post.endsWith(SHARE_TAGS));
  assert.ok(post.length + 24 <= 280, `post is ${post.length} characters`);
});

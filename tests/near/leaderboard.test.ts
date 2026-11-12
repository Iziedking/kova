import assert from "node:assert/strict";
import { test } from "node:test";
import { CHIP, type ChipTable } from "../../src/adapters/near/chip";
import { TABLE_PAGE, buildLeaderboard, displayAccount, readAllTables, serializeLeaderboard } from "../../src/adapters/near/leaderboard";

const HOUSE = "house.kingizie.testnet";

function table(id: number, status: ChipTable["status"], stakeChip: number, seats: [string, number][]): ChipTable {
  const stake = BigInt(stakeChip) * CHIP;
  const pot = stake * BigInt(seats.length);
  const winners = seats.filter(([, award]) => award > 0).length;
  return {
    id: String(id), host: HOUSE, stake, seats: seats.length, round_seconds: 60, status,
    opened_at: 0, open_until: 0, locked_at: 0, start_deadline: 0, starts_at: 0, ends_at: 0, settle_deadline: 0,
    pot, burned: status === "Settled" ? pot / 10n : 0n, winners,
    players: seats.map(([player, award]) => ({ player, commitment: "c", market: "near:wrap.near", start_price: null, end_price: null, score_bps: null, award: BigInt(award) * CHIP })),
  };
}

// The five tables played live on 2026-11-12, plus a refunded one that must not count.
const live = [
  table(5, "Settled", 100, [[HOUSE, 90], ["kingizie.testnet", 90]]),
  table(4, "Settled", 50, [[HOUSE, 90], ["kingizie.testnet", 0]]),
  table(6, "Voided", 100, [[HOUSE, 0], ["kingizie.testnet", 0]]),
  table(3, "Settled", 50, [[HOUSE, 0], ["kingizie.testnet", 90]]),
  table(2, "Settled", 25, [[HOUSE, 0], ["kingizie.testnet", 45]]),
  table(1, "Settled", 25, [[HOUSE, 45], ["kingizie.testnet", 0]]),
];

test("the leaderboard counts settled tables only, with wins, splits and net CHIP", () => {
  const board = buildLeaderboard(live, HOUSE);
  assert.equal(board.settledTables, 5);
  const [first, second] = board.rows;
  // House: staked 250, won 90+90+45 = 225, net -25. Player: staked 250, won 90+90+45 = 225, net -25.
  // Equal net and equal wins (2 each), equal tables: the account name breaks the tie.
  assert.equal(first.player, HOUSE);
  assert.equal(first.isHouse, true);
  assert.deepEqual([first.tables, first.wins, first.splits, first.losses], [5, 2, 1, 2]);
  assert.equal(first.net, -25n * CHIP);
  assert.equal(second.player, "kingizie.testnet");
  assert.deepEqual([second.tables, second.wins, second.splits, second.losses], [5, 2, 1, 2]);
  assert.equal(second.net, -25n * CHIP);
  assert.equal(second.lastTableId, "5");
  // Identical records share first place.
  assert.deepEqual([first.rank, second.rank], [1, 1]);
  // Every settled pot burns 10%, so all players together are down by exactly what burned.
  const burned = live.filter((t) => t.status === "Settled").reduce((sum, t) => sum + t.burned, 0n);
  assert.equal(board.rows.reduce((sum, r) => sum + r.net, 0n), -burned);
});

test("rows rank by net CHIP, then wins, then tables played", () => {
  const board = buildLeaderboard(
    [
      table(3, "Settled", 10, [["ada.testnet", 18], ["bob.testnet", 0]]),
      table(2, "Settled", 10, [["cy.testnet", 18], ["bob.testnet", 0]]),
      table(1, "Settled", 10, [["ada.testnet", 0], ["cy.testnet", 18]]),
    ],
    HOUSE,
  );
  assert.deepEqual(board.rows.map((r) => r.player), ["cy.testnet", "ada.testnet", "bob.testnet"]);
  assert.deepEqual(board.rows.map((r) => r.rank), [1, 2, 3]);

  // Two equal records share a rank and the next one skips it: 1, 1, 3.
  const tied = buildLeaderboard(
    [
      table(3, "Settled", 10, [["dee.testnet", 18], ["bob.testnet", 0]]),
      table(2, "Settled", 10, [["cy.testnet", 18], ["eve.testnet", 0]]),
      table(1, "Settled", 10, [["ada.testnet", 18], ["fay.testnet", 0]]),
    ],
    HOUSE,
  );
  assert.deepEqual(tied.rows.map((r) => [r.player, r.rank]), [
    ["ada.testnet", 1], ["cy.testnet", 1], ["dee.testnet", 1],
    ["bob.testnet", 4], ["eve.testnet", 4], ["fay.testnet", 4],
  ]);
  assert.deepEqual(serializeLeaderboard(board).rows[0].net, (16n * CHIP).toString());
});

test("an empty chain gives an empty board", () => {
  assert.deepEqual(buildLeaderboard([], HOUSE), { rows: [], settledTables: 0, truncated: false });
});

test("every table is read page by page, and the cap is reported", async () => {
  const all = Array.from({ length: 120 }, (_, i) => table(120 - i, "Settled", 10, [["ada.testnet", 18], [HOUSE, 0]]));
  const calls: (string | undefined)[] = [];
  const chip = {
    async getTables(before?: string, limit = 20) {
      calls.push(before);
      const start = before ? all.findIndex((t) => t.id === before) + 1 : 0;
      return all.slice(start, start + limit);
    },
  };
  const read = await readAllTables(chip);
  assert.equal(read.tables.length, 120);
  assert.equal(read.truncated, false);
  assert.deepEqual(calls, [undefined, "71", "21"]);
  assert.equal(TABLE_PAGE, 50);

  const capped = await readAllTables(chip, 2);
  assert.equal(capped.tables.length, 100);
  assert.equal(capped.truncated, true);
});

test("named accounts read as they are and implicit ones are shortened", () => {
  assert.equal(displayAccount("ada.testnet"), "ada.testnet");
  assert.equal(displayAccount("98793cd91a3f870fb126f66285808c7e094afcfc4eda8a970f6648cdf0dbd6de"), "98793c…d6de");
  assert.equal(displayAccount("0x85f17cf997934a597031b2e18a9ab6ebd4b9f6a4"), "0x85f1…f6a4");
  // Not hex: a named account that happens to be long stays whole.
  assert.equal(displayAccount("a-very-long-but-named-account-for-the-poker-table.testnet"), "a-very-long-but-named-account-for-the-poker-table.testnet");
});

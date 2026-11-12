import assert from "node:assert/strict";
import { test } from "node:test";
import { CHIP, formatChip, parseEvents, pickCommitment } from "../../src/adapters/near/chip";
import { NearAiHouseBrain } from "../../src/adapters/near/near-ai";
import { decimalToE18 } from "../../src/adapters/near/prices";
import { MemoryNearPickStore } from "../../src/backend/near/service";

test("commitment matches the contract vector", async () => {
  // Same vector as commitment_vector_matches_the_typescript_client in near/chip/src/tests.rs.
  assert.equal(
    await pickCommitment("alice.testnet", "near:blackdragon.tkn.near", "00112233445566778899aabbccddeeff"),
    "e5c7cd5b89865003c0aac5ba6fde8659a7f6b82519ee0b3909f3794388ff3bfe",
  );
});

test("decimal prices convert exactly to 18 decimals", () => {
  assert.equal(decimalToE18("1"), 10n ** 18n);
  assert.equal(decimalToE18("0.000000006416"), 6_416_000_000n);
  assert.equal(decimalToE18("2048.03309727141"), 2_048_033_097_271_410_000_000n);
  assert.equal(decimalToE18("1.2e-8"), 12_000_000_000n);
  assert.equal(decimalToE18("0.1234567890123456789"), 123_456_789_012_345_678n);
  assert.throws(() => decimalToE18("-1"));
  assert.throws(() => decimalToE18("abc"));
});

test("CHIP amounts format without floating point", () => {
  assert.equal(formatChip(1_234n * CHIP + CHIP / 2n), "1,234.5");
  assert.equal(formatChip(5n), "0");
  assert.equal(formatChip(-25n * CHIP), "-25");
});

test("events are read from logs and junk is ignored", () => {
  const events = parseEvents([
    'EVENT_JSON:{"standard":"nep141","version":"1.0.0","event":"ft_burn","data":[{"owner_id":"chip.testnet","amount":"5","memo":"pot_burn:table:1"}]}',
    "plain log",
    "EVENT_JSON:{broken",
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "ft_burn");
});

test("the House brain spends nothing without a key and respects its daily cap", async () => {
  let calls = 0;
  const reply = (content: string) =>
    (async () => {
      calls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    }) as unknown as typeof fetch;
  const candidates = [
    { market: "near:a", symbol: "A", change1hPct: 3, liquidityUsd: 20_000 },
    { market: "near:b", symbol: "B", change1hPct: -1, liquidityUsd: 30_000 },
  ];

  const off = new NearAiHouseBrain({ apiKey: null, model: "m", dailyLimit: 10, fetcher: reply("{}") });
  assert.equal(off.enabled, false);
  assert.equal(await off.choose(candidates), null);
  assert.equal(calls, 0);

  const zero = new NearAiHouseBrain({ apiKey: "k", model: "m", dailyLimit: 0, fetcher: reply("{}") });
  assert.equal(await zero.choose(candidates), null);
  assert.equal(calls, 0);

  const good = new NearAiHouseBrain({ apiKey: "k", model: "m", dailyLimit: 2, fetcher: reply('Sure: {"market":"near:b","reason":"Deepest pool, least noise."}') });
  assert.deepEqual(await good.choose(candidates), { market: "near:b", reason: "Deepest pool, least noise.", model: "m" });
  await good.choose(candidates);
  assert.equal(await good.choose(candidates), null, "third call is over the cap of 2");
  assert.equal(calls, 2);

  const invented = new NearAiHouseBrain({ apiKey: "k", model: "m", dailyLimit: 5, fetcher: reply('{"market":"near:zzz","reason":"Not on the list."}') });
  assert.equal(await invented.choose(candidates), null);

  const failing = new NearAiHouseBrain({ apiKey: "k", model: "m", dailyLimit: 5, fetcher: (async () => { throw new Error("timeout"); }) as unknown as typeof fetch });
  assert.equal(await failing.choose(candidates), null);
});

test("a seat holds one pick", async () => {
  const store = new MemoryNearPickStore();
  assert.equal(await store.putPick({ contractId: "c", tableId: "1", player: "a", commitment: "x", sealed: {} }), true);
  assert.equal(await store.putPick({ contractId: "c", tableId: "1", player: "a", commitment: "y", sealed: {} }), false);
  assert.equal((await store.getPicks("c", "1")).get("a")?.commitment, "x");
});

import assert from "node:assert/strict";
import test from "node:test";
import { capturePairMark, priceUsdToPrice18 } from "../../src/adapters/game/price-capture";

const mint = "8wXtPeU6557ETkp9WHFY1n1EcU6NxDvbAggHGsMYiHsB";
const pair = "Ak7oAUqQ9jYu5YvfmDrtDC3WHi7BcN5Y4k8Bh3yk4B5e";

function respond(pairs: unknown) {
  return async () => new Response(JSON.stringify({ pairs }), { status: 200 });
}

test("decimal prices scale to 18 places and truncate extra precision toward zero", () => {
  assert.equal(priceUsdToPrice18("1"), "1000000000000000000");
  assert.equal(priceUsdToPrice18("0.000012345"), "12345000000000");
  assert.equal(priceUsdToPrice18("0.1234567890123456789999"), "123456789012345678");
});

test("zero, negative, exponent and malformed prices are refused", () => {
  for (const bad of ["0", "0.0", "-1", "1e-7", "abc", ""]) assert.throws(() => priceUsdToPrice18(bad));
});

test("a mark is taken only from the exact committed pair and mint", async () => {
  const mark = await capturePairMark({ pairAddress: pair, mint, fetcher: respond([{ chainId: "solana", pairAddress: pair, baseToken: { address: mint }, priceUsd: "0.0042" }]) });
  assert.equal(mark.price18, "4200000000000000");
  assert.match(mark.rawResponseHash, /^[0-9a-f]{64}$/);
});

test("a pair quoting another base token is not this pick", async () => {
  await assert.rejects(
    capturePairMark({ pairAddress: pair, mint, fetcher: respond([{ chainId: "solana", pairAddress: pair, baseToken: { address: "So11111111111111111111111111111111111111112" }, priceUsd: "150" }]) }),
    /PRICE_PAIR_MINT_MISMATCH/,
  );
});

test("a missing pair or missing price fails instead of defaulting to zero", async () => {
  await assert.rejects(capturePairMark({ pairAddress: pair, mint, fetcher: respond(null) }), /PRICE_PAIR_MISSING/);
  await assert.rejects(capturePairMark({ pairAddress: pair, mint, fetcher: respond([{ chainId: "solana", pairAddress: pair, baseToken: { address: mint }, priceUsd: null }]) }), /PRICE_UNAVAILABLE/);
});

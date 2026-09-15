import assert from "node:assert/strict";
import test from "node:test";
import { MARKET_CATALOG, marketById } from "../src/domain/market-catalog";

test("catalog binds each market to one exact pool and two exact mints", () => {
  assert.equal(new Set(MARKET_CATALOG.map((market) => market.id)).size, MARKET_CATALOG.length);
  assert.equal(new Set(MARKET_CATALOG.map((market) => market.pool)).size, MARKET_CATALOG.length);
  for (const market of MARKET_CATALOG) {
    assert.notEqual(market.stockMint, market.memeMint);
    assert.equal(market.raydiumProgram, "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK");
    assert.equal(market.status === "captured_snapshot", market.capability !== "unavailable");
  }
});

test("catalog lookup is explicit and unknown markets remain absent", () => {
  assert.equal(marketById("nvdge-nvdax")?.pool, "Ak7oAUqQ9jYu5YvfmDrtDC3WHi7BcN5Y4k8Bh3yk4B5e");
  assert.equal(marketById("not-a-market"), undefined);
});

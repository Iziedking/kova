import assert from "node:assert/strict";
import test from "node:test";
import { PublicKey, type Connection } from "@solana/web3.js";
import { extractJsonObject, runAdmission } from "../../src/application/game/admission";

const mint = "8wXtPeU6557ETkp9WHFY1n1EcU6NxDvbAggHGsMYiHsB";
const requestTimestamp = "2026-09-27T10:00:00.000Z";
const now = () => new Date("2026-09-27T10:00:30.000Z");

const connection = {
  getParsedAccountInfo: async () => ({
    context: { slot: 450_000_000 },
    value: {
      owner: new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
      data: { parsed: { type: "mint", info: { decimals: 6, mintAuthority: null, freezeAuthority: null } } },
    },
  }),
} as unknown as Connection;

const dexFetcher = async () => new Response(JSON.stringify([{
  chainId: "solana", dexId: "raydium", url: "https://dexscreener.com/solana/pair", pairAddress: "pair",
  baseToken: { address: mint, name: "GameStop Meme", symbol: "GME" },
  quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
}]), { status: 200 });

function dealer(rawOutput: string, toolsUsed: string[] = ["news_search"]) {
  return { classify: async () => ({ rawOutput, model: "test", costUsd: 0, toolsUsed, requestId: "req-1" }) };
}

const minimalRejection = {
  mint,
  requestTimestamp,
  decision: "REJECTED",
  confidence: 0.4,
  classification: { isStockThemedMeme: false, isIssuerBackedTokenizedStock: false, stockOrCompanyReference: null },
  reasons: ["The narrative does not reference a public company."],
  evidence: [],
};

test("a fenced minimal verdict is completed with chain facts and validated", async () => {
  const result = await runAdmission({ mint, requestTimestamp, connection, fetcher: dexFetcher, now, dealer: dealer("```json\n" + JSON.stringify(minimalRejection) + "\n```") });
  assert.equal(result.ok, true, result.code ?? "");
  assert.equal(result.decision?.tokenIdentity.decimals, 6);
  assert.equal(result.decision?.tokenIdentity.symbol, "GME");
  assert.equal(result.decision?.evaluatedAt, "2026-09-27T10:00:30.000Z");
});

test("model claims about token identity are replaced by what KOVA read on chain", async () => {
  const lying = { ...minimalRejection, tokenIdentity: { decimals: 9, mintAuthority: "none" } };
  const result = await runAdmission({ mint, requestTimestamp, connection, fetcher: dexFetcher, now, dealer: dealer(JSON.stringify(lying)) });
  assert.equal(result.ok, true, result.code ?? "");
  assert.equal(result.decision?.tokenIdentity.decimals, 6);
});

test("prose around the JSON object is malformed, not salvaged", async () => {
  const result = await runAdmission({ mint, requestTimestamp, connection, fetcher: dexFetcher, now, dealer: dealer("Here is my verdict: " + JSON.stringify(minimalRejection)) });
  assert.equal(result.ok, false);
  assert.equal(result.code, "MALFORMED_DEALER_OUTPUT");
});

test("null written as a string is still rejected", async () => {
  const drifted = { ...minimalRejection, classification: { ...minimalRejection.classification, isStockThemedMeme: "null" } };
  const result = await runAdmission({ mint, requestTimestamp, connection, fetcher: dexFetcher, now, dealer: dealer(JSON.stringify(drifted)) });
  assert.equal(result.code, "MALFORMED_DEALER_OUTPUT");
});

test("a verdict about a different mint cannot be reused", async () => {
  const other = { ...minimalRejection, mint: "So11111111111111111111111111111111111111112" };
  const result = await runAdmission({ mint, requestTimestamp, connection, fetcher: dexFetcher, now, dealer: dealer(JSON.stringify(other)) });
  assert.equal(result.code, "DEALER_IDENTITY_MISMATCH");
});

test("any tool outside the read-only allowlist voids the run", async () => {
  const result = await runAdmission({ mint, requestTimestamp, connection, fetcher: dexFetcher, now, dealer: dealer(JSON.stringify(minimalRejection), ["news_search", "wallet_transfer"]) });
  assert.equal(result.code, "UNSAFE_DEALER_TOOL");
  assert.equal(result.decision, null);
});

test("json extraction accepts only a bare or fenced object", () => {
  assert.deepEqual(extractJsonObject('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJsonObject('```\n{"a":1}\n```'), { a: 1 });
  assert.equal(extractJsonObject("[1,2]"), null);
  assert.equal(extractJsonObject('ok {"a":1}'), null);
});

import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { TradingSimService } from "../../src/backend/game/trading-sim";
import { ChainGameService, type ChainGameDependencies } from "../../src/backend/game/chain-game";
import { presentPublicEvents } from "../../src/backend/game/table-presentation";
import { projectClaimState } from "../../src/domain/game/claim-state";
import type { MarketFeed } from "../../src/adapters/game/market-feed";
import { createGameRouter, type GameRouterRuntime } from "../../src/backend/game/routes";
import type { GameEventRecord } from "../../src/domain/game/events";

test("missing DEX marks remain unavailable in match state and refuse settlement scoring", async () => {
  const account = { id: "account", principal_id: "player", wallet: "wallet", cash_micro_usd: "9000000000", starting_cash_micro_usd: "10000000000", funding_status: "funded", status: "active" };
  const pool = { query: async (sql: string) => {
    if (sql.includes("FROM game_tables")) return { rows: [{ id: "table", rules: { gameMode: "trading" }, status: "ACTIVE", ends_at: new Date(Date.now() + 60000) }] };
    if (sql.includes("FROM game_trading_accounts")) return { rows: [account] };
    if (sql.includes("FROM game_trading_positions")) return { rows: [{ account_id: "account", asset_mint: "held-outside-feed", symbol: "HELD", quantity_raw: "1000000000", cost_basis_micro_usd: "1000000000" }] };
    if (sql.includes("FROM game_trading_fills")) return { rows: [] };
    throw new Error("Unexpected query: " + sql);
  } } as unknown as Pool;
  const feed = { list: async () => ({ assets: [] }), get: async () => null } as unknown as MarketFeed;
  const service = new TradingSimService({ pool, feed, fetcher: async () => Response.json([]) });
  const result = await service.matchState("table", "player");
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.value.account?.equityMicroUsd, null);
  assert.equal(result.value.account?.pnlBps, null);
  assert.equal(result.value.account?.positions[0]?.valueMicroUsd, null);
  assert.equal(result.value.standings[0]?.pnlBps, null);
  assert.deepEqual(result.value.eligibleMints, ["held-outside-feed"]);
  assert.equal(result.value.eligibleAssets[0]?.symbol, "HELD");
  assert.equal(result.value.eligibleAssets[0]?.priceUsd, null);
  await assert.rejects(service.equities("table"), /PRICE_UNAVAILABLE/);
});

test("public table activity omits private and malformed event payloads", () => {
  const base: GameEventRecord = { sequence: "1", tableId: "table", audience: "public", principalId: null, eventType: "table.active", payload: { status: "ACTIVE" }, createdAt: "2026-09-29T00:00:00.000Z" };
  const items = presentPublicEvents([
    base,
    { ...base, sequence: "2", audience: "principal", payload: { message: "private pick" } },
    { ...base, sequence: "3", payload: { message: "public", saltHex: "secret" } },
    { ...base, sequence: "4", eventType: "pick.submitted", payload: { message: "hidden" } },
    { ...base, sequence: "5", eventType: "constructor", payload: {} },
  ]);
  assert.deepEqual(items.map((row) => row.id), ["1"]);
  assert.equal(items[0]?.text, "The round is live.");
});

test("awards and refund eligibility remain pending until their matching entry flag is confirmed", () => {
  const entry = { funded: true, claimed: false, refunded: false, awardRaw: "2000000" };
  assert.equal(projectClaimState("settled", entry, "1000000").status, "pending");
  assert.equal(projectClaimState("settled", { ...entry, claimed: true }, "1000000").status, "paid");
  assert.equal(projectClaimState("voided", entry, "1000000").status, "pending");
  assert.deepEqual(projectClaimState("voided", { ...entry, refunded: true }, "1000000"), { status: "refunded", kind: "refund", amountRaw: "1000000" });
  assert.equal(projectClaimState("active", { ...entry, claimed: true }, "1000000").status, "not_applicable");
  assert.equal(projectClaimState("settled", { ...entry, awardRaw: "0" }, "1000000").status, "not_applicable");
  assert.equal(projectClaimState("settled", { ...entry, funded: false, claimed: true }, "1000000").status, "not_applicable");
});

test("backend claim receipts are written only after independent entry confirmation and are reused", async () => {
  let claimed = false;
  let reads = 0;
  let receipt: { kind: string; amountRaw: string } | null = null;
  const query = async (sql: string, args: unknown[] = []) => {
    if (sql.startsWith("SELECT wallet")) return { rows: [{ wallet: "So11111111111111111111111111111111111111112" }] };
    if (sql.startsWith("SELECT payload")) return { rows: receipt ? [{ payload: receipt }] : [] };
    if (sql.includes("INSERT INTO game_events")) receipt = args[2] as typeof receipt;
    return { rows: [] };
  };
  const pool = { query, connect: async () => ({ query, release: () => undefined }) } as unknown as Pool;
  const deps = { pool, client: {
    fetchTable: async () => ({ status: { settled: {} }, stakeRaw: 1000000n }),
    fetchEntry: async () => { reads += 1; return { funded: true, claimed, refunded: false, awardRaw: 2000000n }; },
  } } as unknown as ChainGameDependencies;
  const service = new ChainGameService(deps);
  assert.equal((await service.claimState("table", "player")).status, "pending");
  assert.equal(receipt, null);
  claimed = true;
  assert.equal((await service.claimState("table", "player")).status, "paid");
  assert.deepEqual(receipt, { kind: "payout", amountRaw: "2000000" });
  assert.equal((await service.claimState("table", "player")).status, "paid");
  assert.equal(reads, 2, "a durable confirmed receipt needs no repeat RPC");
});

test("private trading reads and claim status refuse unauthorized requests before accessing account state", async () => {
  let tradingReads = 0;
  let claimReads = 0;
  const table = { id: "private-table" };
  const runtime = {
    repository: {
      listPublicTables: async () => [],
      principalForPrivyUser: async () => ({ id: "member" }),
      tableForPrincipal: async (_id: string, principal: string) => principal === "member" ? table : null,
    },
    auth: { verifyBearer: async (token: string) => token === "member-token" ? { privyUserId: "did:privy:member" } : null },
    trading: { matchState: async () => { tradingReads += 1; return { ok: true, value: { standings: [] } }; } },
    chain: { claimState: async () => { claimReads += 1; return { status: "pending", kind: "payout", amountRaw: "1" }; } },
  } as unknown as GameRouterRuntime;
  const app = createGameRouter(runtime);
  assert.equal((await app.request("/api/game/tables/private-table/trading")).status, 404);
  assert.equal((await app.request("/api/game/tables/private-table/claim/status")).status, 401);
  assert.equal(tradingReads, 0);
  assert.equal(claimReads, 0);
  assert.equal((await app.request("/api/game/tables/private-table/trading", { headers: { authorization: "Bearer member-token" } })).status, 200);
  assert.equal((await app.request("/api/game/tables/private-table/claim/status", { headers: { authorization: "Bearer member-token" } })).status, 200);
  assert.equal(tradingReads, 1);
  assert.equal(claimReads, 1);
});

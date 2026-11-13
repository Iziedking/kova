/**
 * NEAR mode routes. Mounted only when NEAR mode is on.
 *
 *   GET  /api/near/config              contract, network, accounts, markets, game methods
 *   GET  /api/near/markets             the NEAR memecoin list with live prices
 *   GET  /api/near/house               the House account, its bankroll and open tables
 *   POST /api/near/house-table         opens a two-seat table with the House seated
 *   POST /api/near/picks               a seated player's pick behind their commitment
 *   GET  /api/near/leaderboard         every settled table ranked by net CHIP, built from get_tables,
 *                                      plus the launch scouts (seats with a meme.cooking pick)
 *   GET  /api/near/launches            meme.cooking auctions cooking now (numbers from its contract) and recent launches
 *   GET  /api/near/tables/:id/evidence price marks for a table, and the House's reason once it ended
 *
 * Reads that the browser can make itself (stats, tables, balances) go straight to the contract.
 */
import { Hono } from "hono";
import { z } from "zod";
import { CHIP, GAME_METHODS, type NearNetwork } from "../../adapters/near/chip";
import { serializeLeaderboard, serializeScouts } from "../../adapters/near/leaderboard";
import { MEME_COOKING, type MemeCookingReader, serializeLobby } from "../../adapters/near/meme-cooking";
import { NEAR_MARKETS, type NearPriceFeed } from "../../adapters/near/prices";
import type { ChainLog } from "./chain-log";
import { type NearChipService, ROUND_CHOICES } from "./service";

export type NearRouterRuntime = {
  service: NearChipService;
  log: ChainLog;
  prices: NearPriceFeed;
  memeCooking: MemeCookingReader;
  network: NearNetwork;
  contractId: string;
  settlerAccount: string;
  houseAccount: string;
};

const pickBody = z.object({
  tableId: z.string().regex(/^\d+$/),
  player: z.string().regex(/^[a-z0-9._-]{2,64}$/),
  market: z.string().max(96),
  salt: z.string().max(128),
});

const houseBody = z.object({
  stake: z.string().regex(/^\d+$/).optional(),
  stakeChip: z.number().int().positive().max(1_000).optional(),
  roundSeconds: z.number().int(),
});

function error(code: string, message: string) {
  return { error: { code, message } };
}

/** A small fixed-window limiter per client address. Enough to stop one browser spamming the House. */
function limiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; reset: number }>();
  return (key: string) => {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}

export function createNearRouter(runtime: NearRouterRuntime): Hono {
  const app = new Hono();
  const houseLimit = limiter(6, 60_000);
  let marketsCache: { at: number; body: unknown } | null = null;
  let leaderboardCache: { at: number; body: unknown } | null = null;
  let launchesCache: { at: number; body: unknown } | null = null;

  app.get("/api/near/config", (c) =>
    c.json({
      network: runtime.network.networkId,
      rpcUrl: runtime.network.rpcUrl,
      contractId: runtime.contractId,
      settlerAccount: runtime.settlerAccount,
      houseAccount: runtime.houseAccount,
      gameMethods: GAME_METHODS,
      roundChoices: ROUND_CHOICES,
      markets: NEAR_MARKETS,
      explorer: { tx: runtime.network.explorerTx("{hash}"), account: runtime.network.explorerAccount("{account}") },
    }),
  );

  app.get("/api/near/markets", async (c) => {
    if (marketsCache && Date.now() - marketsCache.at < 30_000) return c.json(marketsCache.body);
    const rows = await Promise.all(
      NEAR_MARKETS.map(async (m) => {
        try {
          const p = await runtime.prices.price(m.id);
          return { ...m, available: true, priceUsd: p.priceUsd, liquidityUsd: Math.round(p.liquidityUsd), change1hPct: p.change1hPct, trades5m: p.trades5m, trades1h: p.trades1h, source: p.source };
        } catch (e) {
          return { ...m, available: false, reason: (e as Error).message.slice(0, 160) };
        }
      }),
    );
    const body = { markets: rows, note: "Mainnet prices, used to score a game played with a testnet token." };
    marketsCache = { at: Date.now(), body };
    return c.json(body);
  });

  app.get("/api/near/house", async (c) => {
    const status = await runtime.service.houseStatus();
    return c.json({ ...status, balance: status.balance.toString(), sittingOut: status.balance < CHIP });
  });

  app.post("/api/near/house-table", async (c) => {
    const client = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!houseLimit(client)) return c.json(error("RATE_LIMITED", "Too many House tables from this address. Wait a minute."), 429);
    const parsed = houseBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(error("INVALID", "Send roundSeconds and a stake."), 400);
    const stake = parsed.data.stake ? BigInt(parsed.data.stake) : BigInt(parsed.data.stakeChip ?? 25) * CHIP;
    const result = await runtime.service.openHouseTable({ stake, roundSeconds: parsed.data.roundSeconds });
    if (!result.ok) return c.json(error(result.code, result.message), result.code === "HOUSE_SITS_OUT" || result.code === "HOUSE_BUSY" ? 409 : 400);
    return c.json(result, 201);
  });

  app.post("/api/near/picks", async (c) => {
    const parsed = pickBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(error("INVALID", "Send tableId, player, market and salt."), 400);
    const result = await runtime.service.submitPick(parsed.data);
    if (!result.ok) return c.json(error(result.code, result.message), 400);
    return c.json(result, result.stored ? 201 : 200);
  });

  app.get("/api/near/log", async (c) => {
    try {
      return c.json({ entries: await runtime.log.recent(), source: "NearBlocks v3 events, memos from NEAR RPC" });
    } catch (e) {
      return c.json(error("LOG_UNAVAILABLE", `The mint and burn log could not be read: ${(e as Error).message.slice(0, 120)}`), 503);
    }
  });

  app.get("/api/near/leaderboard", async (c) => {
    if (leaderboardCache && Date.now() - leaderboardCache.at < 20_000) return c.json(leaderboardCache.body);
    try {
      const read = await runtime.service.leaderboard();
      const board = { ...serializeLeaderboard(read), scouts: serializeScouts(read.scouts) };
      const body = { ...board, stale: false, updatedAt: new Date().toISOString(), source: `get_tables on ${runtime.contractId}` };
      leaderboardCache = { at: Date.now(), body };
      return c.json(body);
    } catch (e) {
      // A failed read keeps serving the last good board, marked stale, rather than an empty one.
      if (leaderboardCache) return c.json({ ...(leaderboardCache.body as object), stale: true });
      return c.json(error("LEADERBOARD_UNAVAILABLE", `The tables could not be read: ${(e as Error).message.slice(0, 120)}`), 503);
    }
  });

  app.get("/api/near/launches", async (c) => {
    if (launchesCache && Date.now() - launchesCache.at < 60_000) return c.json(launchesCache.body);
    try {
      const body = { ...serializeLobby(await runtime.memeCooking.lobby()), stale: false, source: `${MEME_COOKING.contract} (mainnet) and ${MEME_COOKING.api}` };
      launchesCache = { at: Date.now(), body };
      return c.json(body);
    } catch (e) {
      if (launchesCache) return c.json({ ...(launchesCache.body as object), stale: true });
      return c.json(error("LAUNCHES_UNAVAILABLE", `meme.cooking could not be read: ${(e as Error).message.slice(0, 120)}`), 503);
    }
  });

  app.get("/api/near/tables/:id/evidence", async (c) => {
    const id = c.req.param("id");
    if (!/^\d+$/.test(id)) return c.json(error("INVALID", "Table id must be a number."), 400);
    const [marks, houseReason] = await Promise.all([runtime.service.getMarks(id), runtime.service.houseReason(id)]);
    return c.json({
      tableId: id,
      houseReason,
      marks: marks.map((m) => ({ ...m, priceE18: m.priceE18.toString(), capturedAt: m.capturedAt.toISOString(), explorerUrl: m.txHash ? runtime.network.explorerTx(m.txHash) : null })),
    });
  });

  return app;
}

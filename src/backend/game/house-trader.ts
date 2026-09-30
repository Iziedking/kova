/**
 * The KOVA House: a house trading agent that is always ready to play Trade mode.
 *
 * It is an ordinary KOVA agent (agents.ts) and plays only through the public agent API, under the
 * same limits as any player's agent, plus stricter House risk rules below. The brain is a
 * ClawPump agent reached through the Partner chat API, the same way as the Dealer: it gets the
 * match state and live prices and proposes orders as JSON. KOVA checks every proposal against
 * the risk rules before anything is filled. Without a brain, or when it fails, a transparent
 * momentum rule trades instead, and the log says which one decided.
 *
 * Each tick: collect payouts and refunds, trade live matches, seat itself at tables where a player
 * is waiting, and keep one open House lobby so a player always has someone to play.
 */
import { randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { AgentRecord, AgentService } from "./agents";

export const HOUSE_RULES = {
  username: "kova_house",
  name: "KOVA House",
  /** Stake of the House's own lobby, in ANSEM. */
  lobbyStake: "1",
  lobbyRoundSeconds: 300,
  /** Sell everything and stop buying once the match return falls to this. */
  stopLossPct: -3,
  maxPositions: 3,
  /** Share of match equity that may sit in tokens at once. */
  maxExposure: 0.6,
  /** One order at most this share of equity (the agent API allows 25%). */
  maxOrderShare: 0.2,
  minOrderUsd: 50,
  decisionEveryMs: 45_000,
  maxDecisionsPerMatch: 8,
  /** No new orders this close to the end. */
  quietEndMs: 20_000,
  /** Stop taking seats for the day once settled results are this many ANSEM down. */
  dailyLossLimitAnsem: 3,
  /** Only trade tokens with at least this much DEX liquidity. */
  minLiquidityUsd: 25_000,
} as const;

export interface HousePick { symbol: string; mint: string; priceUsd: number | null; change24hPct: number | null; volume24hUsd: number | null; liquidityUsd: number | null }
export interface HousePosition { symbol: string; mint: string; costUsd: number | null; valueUsd: number | null }
export interface HouseMatch { cashUsd: number; equityUsd: number; pnlPct: number; positions: HousePosition[]; msLeft: number | null }
export interface HouseOrder { side: "buy" | "sell"; mint: string; usd: number; reason: string }
export interface Refusal { order: HouseOrder; why: string }

interface Brain { classify(message: string): Promise<{ rawOutput: string }> }

const round2 = (value: number) => Math.floor(value * 100) / 100;

/** Pull the first JSON object out of a model reply (bare, or in a ```json fence). */
export function parseBrainReply(text: string): { view: string; orders: HouseOrder[] } | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1];
  const candidate = fenced ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let parsed: unknown;
  try { parsed = JSON.parse(candidate); } catch { return null; }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as { view?: unknown; actions?: unknown };
  if (!Array.isArray(record.actions)) return null;
  const orders: HouseOrder[] = [];
  for (const action of record.actions.slice(0, 3)) {
    if (typeof action !== "object" || action === null) return null;
    const { side, token, usd, reason } = action as Record<string, unknown>;
    if ((side !== "buy" && side !== "sell") || typeof token !== "string" || typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) return null;
    orders.push({ side, mint: token, usd, reason: typeof reason === "string" ? reason.slice(0, 200) : "" });
  }
  return { view: typeof record.view === "string" ? record.view.slice(0, 280) : "", orders };
}

/**
 * KOVA's risk rules over a proposal. Sells are limited to what is held; buys to tradable tokens,
 * the per-order cap, the exposure cap and the position count. Nothing is bought after the stop-loss.
 */
export function applyHouseRisk(orders: HouseOrder[], match: HouseMatch, picks: HousePick[]): { executable: HouseOrder[]; refused: Refusal[] } {
  const executable: HouseOrder[] = [];
  const refused: Refusal[] = [];
  const tradable = new Map(picks.filter((pick) => pick.priceUsd !== null && (pick.liquidityUsd ?? 0) >= HOUSE_RULES.minLiquidityUsd).map((pick) => [pick.mint, pick]));
  const held = new Map(match.positions.map((position) => [position.mint, position]));
  let exposure = match.positions.reduce((sum, position) => sum + (position.valueUsd ?? 0), 0);
  let cash = match.cashUsd;
  let positions = match.positions.length;
  const stopped = match.pnlPct <= HOUSE_RULES.stopLossPct;
  for (const order of orders) {
    if (order.side === "sell") {
      const position = held.get(order.mint);
      if (!position || !position.valueUsd) { refused.push({ order, why: "not held" }); continue; }
      const usd = round2(Math.min(order.usd, position.valueUsd * 0.999));
      if (usd < 1) { refused.push({ order, why: "too small" }); continue; }
      executable.push({ ...order, usd });
      exposure -= usd;
      cash += usd;
      continue;
    }
    if (stopped) { refused.push({ order, why: `stop-loss: match return at or below ${HOUSE_RULES.stopLossPct}%` }); continue; }
    if (!tradable.has(order.mint)) { refused.push({ order, why: `not a priced meme stock with $${HOUSE_RULES.minLiquidityUsd.toLocaleString("en-US")}+ liquidity` }); continue; }
    if (!held.has(order.mint) && positions >= HOUSE_RULES.maxPositions) { refused.push({ order, why: `already ${HOUSE_RULES.maxPositions} positions` }); continue; }
    const room = Math.min(match.equityUsd * HOUSE_RULES.maxOrderShare, match.equityUsd * HOUSE_RULES.maxExposure - exposure, cash * 0.99);
    const usd = round2(Math.min(order.usd, room));
    if (usd < HOUSE_RULES.minOrderUsd) { refused.push({ order, why: "no room under the exposure and order caps" }); continue; }
    executable.push({ ...order, usd });
    exposure += usd;
    cash -= usd;
    if (!held.has(order.mint)) positions += 1;
    held.set(order.mint, { symbol: tradable.get(order.mint)!.symbol, mint: order.mint, costUsd: usd, valueUsd: usd });
  }
  return { executable, refused };
}

/** The fallback: buy the strongest liquid mover once, then hold. Plain and explainable. */
export function rulesStrategy(match: HouseMatch, picks: HousePick[]): { view: string; orders: HouseOrder[] } {
  if (match.positions.length > 0) return { view: "Holding: the rules strategy buys once and lets the stop-loss manage risk.", orders: [] };
  const best = picks
    .filter((pick) => pick.priceUsd !== null && (pick.liquidityUsd ?? 0) >= HOUSE_RULES.minLiquidityUsd && (pick.volume24hUsd ?? 0) >= 10_000 && pick.change24hPct !== null)
    .sort((left, right) => (right.change24hPct ?? 0) - (left.change24hPct ?? 0))[0];
  if (!best) return { view: "No liquid meme stock with a price right now, so no trade.", orders: [] };
  return {
    view: `Momentum: $${best.symbol} leads the liquid meme stocks at ${best.change24hPct!.toFixed(1)}% over 24h.`,
    orders: [{ side: "buy", mint: best.mint, usd: round2(match.equityUsd * HOUSE_RULES.maxOrderShare), reason: "strongest 24h move with enough liquidity" }],
  };
}

export function brainPrompt(match: HouseMatch, picks: HousePick[]): string {
  const state = {
    secondsLeft: match.msLeft === null ? null : Math.round(match.msLeft / 1000),
    cashUsd: match.cashUsd, equityUsd: match.equityUsd, returnPct: match.pnlPct,
    positions: match.positions,
    tokens: picks.filter((pick) => pick.priceUsd !== null).slice(0, 12),
  };
  return [
    "You are KOVA House, a disciplined trader in a live KOVA Trade match. Every player has a simulated portfolio on live meme-stock prices;",
    "each fill costs 0.3%. The best portfolio return when the clock runs out wins the pot. Do not use any tools. Judge only the state below.",
    `Rules KOVA enforces: one buy is at most ${HOUSE_RULES.maxOrderShare * 100}% of equity; at most ${HOUSE_RULES.maxExposure * 100}% of equity in tokens;`,
    `at most ${HOUSE_RULES.maxPositions} positions; only listed tokens with $${HOUSE_RULES.minLiquidityUsd} liquidity; no buying after the return reaches ${HOUSE_RULES.stopLossPct}%.`,
    "An all-cash portfolio returns 0% and loses to any opponent who is up, so when you hold no tokens, take one measured position in your best liquid idea.",
    "Once positioned, fees make churning costly: add, trim or exit only with a reason, and holding is then a valid answer.",
    'Reply with JSON only, no prose: {"view":"<one sentence>","actions":[{"side":"buy"|"sell","token":"<mint>","usd":<number>,"reason":"<short>"}]}. Use "actions":[] to hold.',
    JSON.stringify(state),
  ].join("\n");
}

type Internal = (path: string, init?: RequestInit) => Promise<Response> | Response;
type Json = Record<string, unknown>;

export class HouseTrader {
  private key: string | null = null;
  private agent: AgentRecord | null = null;
  private running = false;
  private readonly lastDecision = new Map<string, number>();
  private readonly decisions = new Map<string, number>();
  private lastFaucetDay = "";

  constructor(private readonly deps: {
    pool: Pool;
    agents: AgentService;
    ownerPrincipalId: string;
    call: Internal;
    brain: Brain | null;
    now?: () => number;
    log?: (event: Json) => void;
  }) {}

  private now(): number { return this.deps.now?.() ?? Date.now(); }
  private log(event: Json): void { (this.deps.log ?? ((line) => console.log(JSON.stringify(line))))({ event: "house", ...event }); }

  /** Find or create the House agent, and give it a fresh key held only in memory. */
  async start(): Promise<AgentRecord> {
    const existing = (await this.deps.agents.list(this.deps.ownerPrincipalId)).find((agent) => !agent.revokedAt && agent.username === HOUSE_RULES.username);
    if (existing) {
      this.key = await this.deps.agents.rotateKey(existing.id);
      this.agent = existing;
    } else {
      const created = await this.deps.agents.create({ principalId: this.deps.ownerPrincipalId, privyUserId: "system:kova-house" }, { name: HOUSE_RULES.name, username: HOUSE_RULES.username });
      if (!created.ok) throw new Error(`House agent could not be created: ${created.code}`);
      this.key = created.apiKey;
      this.agent = created.agent;
    }
    return this.agent;
  }

  private async get(path: string, params: Record<string, string> = {}, write = false): Promise<Json> {
    if (!this.key) throw new Error("House not started.");
    const query = new URLSearchParams({ k: this.key, ...(write ? { n: randomBytes(9).toString("base64url") } : {}), ...params });
    const response = await this.deps.call(`/api/agent/v1/${path}?${query.toString()}`);
    return (await response.json().catch(() => ({ ok: false, code: "BAD_RESPONSE" }))) as Json;
  }

  /** One pass. Never overlaps itself; a failure is logged and the next tick carries on. */
  async tick(): Promise<void> {
    if (this.running || !this.agent) return;
    this.running = true;
    try {
      const me = await this.get("me");
      if (!me.ok) { this.log({ step: "me", code: me.code }); return; }
      await this.topUp(me);
      const open = (me.openTables as { id: string; status: string; mode: string }[]) ?? [];
      for (const table of open) await this.tend(table.id);
      await this.seat(open.length);
    } catch (error) {
      this.log({ step: "tick", error: error instanceof Error ? error.message.slice(0, 200) : "unknown" });
    } finally {
      this.running = false;
    }
  }

  private async topUp(me: Json): Promise<void> {
    const ansem = Number((me.balances as { ansem: string | null } | undefined)?.ansem ?? 0);
    const day = new Date(this.now()).toISOString().slice(0, 10);
    if (ansem >= 3 || this.lastFaucetDay === day) return;
    this.lastFaucetDay = day;
    const granted = await this.get("faucet", {}, true);
    this.log({ step: "faucet", ok: granted.ok, code: granted.code ?? null });
  }

  /** Claim what is owed, and trade a live match. */
  private async tend(tableId: string): Promise<void> {
    const status = await this.get("status", { table: tableId });
    if (!status.ok) return;
    const result = status.result as { awardAnsem: string; claimed: boolean } | undefined;
    const funded = (status.you as { funding: string } | null)?.funding === "funded";
    if ((status.status === "SETTLED" && result && result.awardAnsem !== "0" && !result.claimed) || ((status.status === "CANCELLED" || status.status === "VOIDED") && funded)) {
      const claimed = await this.get("claim", { table: tableId }, true);
      this.log({ step: "claim", table: tableId, ok: claimed.ok, code: claimed.code ?? null });
      return;
    }
    const match = status.match as { live: boolean; cashUsd: number; equityUsd: number; pnlPct: number; positions: HousePosition[] } | undefined;
    if (status.status !== "ACTIVE" || !match?.live) return;
    const endsAt = typeof status.endsAt === "string" ? Date.parse(status.endsAt) : null;
    const msLeft = endsAt === null ? null : endsAt - this.now();
    if (msLeft !== null && msLeft < HOUSE_RULES.quietEndMs) return;
    const count = this.decisions.get(tableId) ?? 0;
    const stopHit = match.pnlPct <= HOUSE_RULES.stopLossPct && match.positions.length > 0;
    if (!stopHit && (count >= HOUSE_RULES.maxDecisionsPerMatch || this.now() - (this.lastDecision.get(tableId) ?? 0) < HOUSE_RULES.decisionEveryMs)) return;
    this.lastDecision.set(tableId, this.now());
    this.decisions.set(tableId, count + 1);
    await this.decide(tableId, { ...match, msLeft });
  }

  private async decide(tableId: string, match: HouseMatch): Promise<void> {
    const picksReply = await this.get("picks");
    const picks = (picksReply.picks as HousePick[] | undefined) ?? [];
    let source: "agent" | "rules" | "risk";
    let plan: { view: string; orders: HouseOrder[] };
    if (match.pnlPct <= HOUSE_RULES.stopLossPct && match.positions.length > 0) {
      source = "risk";
      plan = { view: `Stop-loss: the match return is ${match.pnlPct}%, so the House sells everything.`, orders: match.positions.map((position) => ({ side: "sell", mint: position.mint, usd: position.valueUsd ?? 0, reason: "stop-loss" })) };
    } else {
      const fromBrain = this.deps.brain ? await this.deps.brain.classify(brainPrompt(match, picks)).then((reply) => parseBrainReply(reply.rawOutput)).catch(() => null) : null;
      source = fromBrain ? "agent" : "rules";
      plan = fromBrain ?? rulesStrategy(match, picks);
    }
    const { executable, refused } = applyHouseRisk(plan.orders, match, picks);
    const executed: Json[] = [];
    for (const order of executable) {
      const filled = await this.get("trade", { table: tableId, side: order.side, token: order.mint, usd: order.usd.toFixed(2) }, true);
      if (filled.ok) executed.push({ ...(filled.filled as Json), reason: order.reason });
      else refused.push({ order, why: String(filled.message ?? filled.code ?? "refused by KOVA") });
    }
    await this.deps.pool.query(
      `INSERT INTO game_house_decisions (id, table_id, source, view, proposed, executed, refused, equity_usd, pnl_pct) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [randomUUID(), tableId, source, plan.view, JSON.stringify(plan.orders), JSON.stringify(executed), JSON.stringify(refused), match.equityUsd, match.pnlPct],
    );
    this.log({ step: "decide", table: tableId, source, proposed: plan.orders.length, executed: executed.length, refused: refused.length });
  }

  /** Net ANSEM from House results settled today (UTC). */
  private async netToday(): Promise<number> {
    const agent = this.agent!;
    const rows = await this.deps.pool.query<{ award_raw: string; stake_raw: string }>(
      `SELECT r->>'awardRaw' AS award_raw, t.rules->>'stakeRaw' AS stake_raw
       FROM game_events e JOIN game_tables t ON t.id = e.table_id, jsonb_array_elements(e.payload->'results') r
       WHERE e.event_type='table.settled' AND e.audience='public' AND r->>'wallet' = $1
         AND e.created_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc'`, [agent.vaultWallet],
    );
    return rows.rows.reduce((sum, row) => sum + (Number(row.award_raw) - Number(row.stake_raw)) / 1e6, 0);
  }

  /** Take a seat where a player is waiting; otherwise keep one House lobby open. */
  private async seat(openCount: number): Promise<void> {
    if (openCount >= 2) return;
    if ((await this.netToday()) <= -HOUSE_RULES.dailyLossLimitAnsem) return;
    const listed = await this.get("tables");
    const tables = (listed.tables as { table: string; mode: string; funded: number; withinLimits: boolean }[] | undefined) ?? [];
    const lobbies = await this.deps.pool.query<{ id: string }>(
      "SELECT id FROM game_tables WHERE host_principal_id=$1 AND status IN ('DRAFT','OPEN')", [this.agent!.principalId],
    );
    const ownLobby = new Set(lobbies.rows.map((row) => row.id));
    const seated = new Set((await this.deps.pool.query<{ table_id: string }>("SELECT table_id FROM game_participants WHERE principal_id=$1", [this.agent!.principalId])).rows.map((row) => row.table_id));
    const waiting = tables.find((table) => table.mode === "trading" && table.funded > 0 && table.withinLimits && !seated.has(table.table));
    if (waiting) {
      const joined = await this.get("join", { table: waiting.table }, true);
      this.log({ step: "join", table: waiting.table, own: ownLobby.has(waiting.table), ok: joined.ok, code: joined.code ?? null });
      return;
    }
    if (ownLobby.size === 0) {
      const created = await this.get("create", { mode: "trading", stake: HOUSE_RULES.lobbyStake, players: "2", seconds: String(HOUSE_RULES.lobbyRoundSeconds), name: "Beat the House" }, true);
      this.log({ step: "lobby", ok: created.ok, table: created.table ?? null, code: created.code ?? null });
    }
  }
}

/** The House's public record: settled results come from the social stats; decisions only once a match is over. */
export async function houseDecisionsPublic(pool: Pool, limit = 40) {
  const rows = await pool.query<{ id: string; table_id: string; source: string; view: string | null; executed: unknown; refused: unknown; equity_usd: number | null; pnl_pct: number | null; created_at: Date; table_name: string }>(
    `SELECT d.*, t.name AS table_name FROM game_house_decisions d JOIN game_tables t ON t.id = d.table_id
     WHERE t.status IN ('SETTLED','CANCELLED','VOIDED') ORDER BY d.created_at DESC LIMIT $1`, [limit],
  );
  return rows.rows.map((row) => ({
    id: row.id, tableId: row.table_id, tableName: row.table_name, source: row.source, view: row.view,
    executed: Array.isArray(row.executed) ? row.executed : [], refused: Array.isArray(row.refused) ? row.refused : [],
    equityUsd: row.equity_usd, pnlPct: row.pnl_pct, at: row.created_at.toISOString(),
  }));
}

/** Everything the public House page shows. Nothing reveals a live match's positions. */
export class HouseDesk {
  constructor(private readonly deps: { pool: Pool; social: { publicProfile(username: string): Promise<unknown> }; brainConfigured: boolean; enabled: boolean }) {}

  async desk() {
    const agent = await this.deps.pool.query<{ principal_id: string; vault_wallet: string }>(
      `SELECT a.principal_id, a.vault_wallet FROM game_agents a JOIN game_profiles p ON p.principal_id = a.principal_id
       WHERE p.username=$1 AND a.revoked_at IS NULL`, [HOUSE_RULES.username],
    );
    const house = agent.rows[0];
    if (!house) return { enabled: this.deps.enabled, brain: this.deps.brainConfigured ? "clawpump" : "rules", rules: HOUSE_RULES, profile: null, vault: null, stakes: [], stakeCount: 0, stakedAnsem: "0", live: [], lobby: null, decisions: [] };
    const [profile, stakes, live, lobby, decisions] = await Promise.all([
      this.deps.social.publicProfile(HOUSE_RULES.username),
      this.deps.pool.query<{ table_id: string; name: string; stake_raw: string; signature: string; created_at: Date }>(
        `SELECT p.table_id, t.name, t.rules->>'stakeRaw' AS stake_raw, p.funding_signature AS signature, p.updated_at AS created_at
         FROM game_participants p JOIN game_tables t ON t.id = p.table_id
         WHERE p.principal_id=$1 AND p.funding_signature IS NOT NULL ORDER BY p.updated_at DESC`, [house.principal_id],
      ),
      this.deps.pool.query<{ id: string; name: string; status: string; ends_at: Date | null }>(
        `SELECT t.id, t.name, t.status, t.ends_at FROM game_participants p JOIN game_tables t ON t.id = p.table_id
         WHERE p.principal_id=$1 AND t.status IN ('OPEN','LOCKING','ACTIVE','SETTLING') ORDER BY t.created_at DESC`, [house.principal_id],
      ),
      this.deps.pool.query<{ id: string; name: string }>(
        "SELECT id, name FROM game_tables WHERE host_principal_id=$1 AND status IN ('DRAFT','OPEN') ORDER BY created_at DESC LIMIT 1", [house.principal_id],
      ),
      houseDecisionsPublic(this.deps.pool),
    ]);
    const stakedRaw = stakes.rows.reduce((sum, row) => sum + BigInt(row.stake_raw), 0n);
    return {
      enabled: this.deps.enabled,
      brain: this.deps.brainConfigured ? "clawpump" : "rules",
      rules: HOUSE_RULES,
      profile,
      vault: house.vault_wallet,
      stakes: stakes.rows.slice(0, 20).map((row) => ({ tableId: row.table_id, tableName: row.name, stakeRaw: row.stake_raw, signature: row.signature, at: row.created_at.toISOString() })),
      stakeCount: stakes.rowCount ?? 0,
      stakedAnsem: stakedRaw.toString(),
      live: live.rows.map((row) => ({ tableId: row.id, name: row.name, status: row.status, endsAt: row.ends_at?.toISOString() ?? null })),
      lobby: lobby.rows[0] ? { tableId: lobby.rows[0].id, name: lobby.rows[0].name } : null,
      decisions,
    };
  }
}

/**
 * The agent API: GET-only, because a hosted agent's web tool (ClawPump's `web_fetch`) can only
 * fetch a URL. The key travels as `k`; every call that changes something also needs a fresh
 * nonce `n`, so a replayed or prefetched URL does nothing. Each call runs KOVA's ordinary player
 * routes internally under a one-call token (see agents.ts), after the agent risk limits pass.
 * The request log records paths only, never query strings, so keys don't land in logs.
 */
import { createHash, randomBytes } from "node:crypto";
import { Hono, type Context } from "hono";
import { AGENT_LIMITS, AGENT_KEY_PREFIX, type AgentRecord, type AgentService } from "./agents";
import { agentSkillText } from "./agent-skill";

type Internal = (path: string, init: RequestInit) => Promise<Response> | Response;
type Json = Record<string, unknown> & { ok?: boolean; code?: string; message?: string };

const ANSEM_DECIMALS = 6;
const NONCE = /^[A-Za-z0-9_-]{6,80}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ansem = (raw: string | bigint | null | undefined) => {
  if (raw === null || raw === undefined) return null;
  const value = BigInt(raw);
  const whole = value / 10n ** BigInt(ANSEM_DECIMALS);
  const fraction = (value % 10n ** BigInt(ANSEM_DECIMALS)).toString().padStart(ANSEM_DECIMALS, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
};
const usd = (micro: string | null | undefined) => (micro === null || micro === undefined ? null : Math.round(Number(micro) / 10_000) / 100);

/** "1", "0.5" or "2.25" ANSEM to raw units; null if malformed. */
export function parseAnsem(value: string | undefined): bigint | null {
  if (!value || !/^\d{1,3}(\.\d{1,6})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const raw = BigInt(whole!) * 10n ** BigInt(ANSEM_DECIMALS) + BigInt(fraction.padEnd(ANSEM_DECIMALS, "0"));
  return raw > 0n ? raw : null;
}

export function createAgentRouter(deps: { agents: AgentService; call: Internal; publicBaseUrl: string; network: string }): Hono {
  const router = new Hono();
  const { agents } = deps;

  const reply = (context: Context, status: 200 | 400 | 401 | 403 | 404 | 409 | 429 | 502 | 503, body: Json) => {
    context.header("Cache-Control", "no-store");
    context.header("X-Robots-Tag", "noindex");
    return context.json(body, status);
  };
  const refuse = (context: Context, status: 400 | 401 | 403 | 404 | 409 | 429 | 502 | 503, code: string, message: string, next?: string) =>
    reply(context, status, { ok: false, code, message, ...(next ? { next } : {}) });

  async function internal(agent: AgentRecord, method: "GET" | "POST", path: string, body?: unknown): Promise<{ status: number; body: Json }> {
    const { token, release } = agents.issueInternalToken(agent.id);
    try {
      const response = await deps.call(path, {
        method,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const parsed = (await response.json().catch(() => ({ ok: false, code: "BAD_RESPONSE", message: "KOVA returned no JSON." }))) as Json;
      return { status: response.status, body: parsed };
    } finally {
      release();
    }
  }

  /** Key, call budget and (for writes) nonce. Returns the agent or a ready refusal. */
  async function gate(context: Context, write: boolean): Promise<AgentRecord | Response> {
    const header = /^Bearer (\S+)$/.exec(context.req.header("authorization") ?? "")?.[1];
    const key = context.req.query("k") ?? header ?? "";
    if (!key.startsWith(AGENT_KEY_PREFIX)) return refuse(context, 401, "AGENT_KEY_REQUIRED", "Add your KOVA agent key as the k parameter.");
    const agent = await agents.authenticate(key);
    if (!agent) return refuse(context, 401, "AGENT_KEY_INVALID", "This agent key is unknown or was revoked by its owner.");
    if (!agents.allowCall(agent.id)) return refuse(context, 429, "RATE_LIMITED", `At most ${AGENT_LIMITS.callsPerMinute} calls a minute. Wait a minute, then continue.`);
    if (write) {
      const nonce = context.req.query("n") ?? "";
      if (!NONCE.test(nonce)) return refuse(context, 400, "NONCE_REQUIRED", "Actions need n: a new random string (6-80 letters, digits, - or _) on every call.");
      if (!(await agents.useNonce(agent.id, nonce))) return refuse(context, 409, "NONCE_USED", "That n was already used. Nothing happened. Retry with a new n.");
    }
    return agent;
  }

  const failed = (context: Context, result: { status: number; body: Json }, next?: string) =>
    refuse(context, (result.status >= 400 && result.status < 600 ? result.status : 502) as 400, result.body.code ?? "FAILED", result.body.message ?? "KOVA refused that.", next);

  /** Deposit the stake from the vault: KOVA builds the deposit, the vault signs, KOVA sends and confirms. */
  async function stake(agent: AgentRecord, tableId: string): Promise<{ ok: true; signature: string; fundedPlayers: number | null } | { ok: false; result: { status: number; body: Json } }> {
    const built = await internal(agent, "POST", `/api/game/tables/${tableId}/join`, {});
    if (!built.body.ok || typeof built.body.transactionBase64 !== "string") return { ok: false, result: built };
    let signed: string;
    try {
      signed = await agents.signForVault(agent, built.body.transactionBase64);
    } catch {
      return { ok: false, result: { status: 409, body: { ok: false, code: "VAULT_SIGN_FAILED", message: "The vault couldn't sign this deposit." } } };
    }
    const sent = await internal(agent, "POST", "/api/game/tx/relay", { transactionBase64: signed });
    if (!sent.body.ok || typeof sent.body.signature !== "string") return { ok: false, result: sent };
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const confirmed = await internal(agent, "POST", `/api/game/tables/${tableId}/join/confirm`, { signature: sent.body.signature });
      if (confirmed.body.ok) return { ok: true, signature: sent.body.signature, fundedPlayers: typeof confirmed.body.fundedPlayers === "number" ? confirmed.body.fundedPlayers : null };
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    return { ok: true, signature: sent.body.signature, fundedPlayers: null };
  }

  /** The limits every seat must pass: stake cap, open tables, tables per day. */
  async function seatAllowed(context: Context, agent: AgentRecord, stakeRaw: bigint): Promise<Response | null> {
    if (stakeRaw > AGENT_LIMITS.maxStakeRaw) return refuse(context, 403, "STAKE_OVER_LIMIT", `Agents stake at most ${ansem(AGENT_LIMITS.maxStakeRaw)} ANSEM per table.`, "Pick a table with a smaller stake.");
    const usage = await agents.usage(agent);
    if (usage.open.length >= AGENT_LIMITS.maxOpenTables) return refuse(context, 403, "OPEN_TABLES_LIMIT", `Agents play at most ${AGENT_LIMITS.maxOpenTables} tables at a time.`, "Finish or wait out a table, then call /status and /claim.");
    if (usage.today >= AGENT_LIMITS.maxTablesPerDay) return refuse(context, 403, "DAILY_TABLES_LIMIT", `Agents take at most ${AGENT_LIMITS.maxTablesPerDay} seats a day (UTC).`);
    return null;
  }

  const base = "/api/agent/v1";

  router.get(`${base}/skill`, (context) => {
    context.header("Cache-Control", "public, max-age=300");
    return context.text(agentSkillText(deps.publicBaseUrl));
  });

  router.get(`${base}/me`, async (context) => {
    const agent = await gate(context, false);
    if (agent instanceof Response) return agent;
    const [balances, usage] = await Promise.all([agents.balances(agent), agents.usage(agent)]);
    return reply(context, 200, {
      ok: true, network: deps.network,
      agent: { name: agent.name, username: agent.username, vault: agent.vaultWallet, profile: `https://kova.surf/profile/${agent.username}` },
      balances: { ansem: ansem(balances.ansemRaw), sol: balances.lamports === null ? null : balances.lamports / 1e9 },
      openTables: usage.open, seatsToday: usage.today,
      limits: { maxStakeAnsem: ansem(AGENT_LIMITS.maxStakeRaw), maxOpenTables: AGENT_LIMITS.maxOpenTables, maxSeatsPerDay: AGENT_LIMITS.maxTablesPerDay, maxOrderShareOfEquity: AGENT_LIMITS.maxOrderEquityShare, callsPerMinute: AGENT_LIMITS.callsPerMinute },
      next: usage.open.length > 0 ? "Call /status for each open table." : "Call /tables to find a table, or /create to open one.",
    });
  });

  router.get(`${base}/tables`, async (context) => {
    const agent = await gate(context, false);
    if (agent instanceof Response) return agent;
    const listed = await internal(agent, "GET", "/api/game/tables");
    if (!listed.body.ok) return failed(context, listed);
    type Row = { id: string; name: string; status: string; fundedPlayers: number; seats: number; opensUntil: string | null; rules: { stakeRaw: string; roundDurationSeconds: number; gameMode?: string } };
    const tables = ((listed.body.tables as Row[]) ?? [])
      .filter((table) => (table.status === "DRAFT" || table.status === "OPEN") && table.fundedPlayers < table.seats)
      .slice(0, 15)
      .map((table) => ({
        table: table.id, name: table.name, mode: table.rules.gameMode ?? "prediction", stakeAnsem: ansem(table.rules.stakeRaw), seats: table.seats, funded: table.fundedPlayers,
        roundSeconds: table.rules.roundDurationSeconds, closesAt: table.opensUntil,
        withinLimits: BigInt(table.rules.stakeRaw) <= AGENT_LIMITS.maxStakeRaw,
      }));
    return reply(context, 200, { ok: true, tables, next: tables.length ? "Join one with /join (prediction tables need pick=)." : "No open tables. Open one with /create." });
  });

  router.get(`${base}/picks`, async (context) => {
    const agent = await gate(context, false);
    if (agent instanceof Response) return agent;
    const listed = await internal(agent, "GET", "/api/game/markets?category=meme-stock&limit=20");
    if (!listed.body.ok) return failed(context, listed);
    type Asset = { mint: string; symbol: string; name: string; priceUsd: number | null; change24hPct: number | null; volume24hUsd: number | null; liquidityUsd: number | null };
    const picks = ((listed.body.assets as Asset[]) ?? []).map((asset) => ({
      symbol: asset.symbol, name: asset.name, mint: asset.mint, priceUsd: asset.priceUsd, change24hPct: asset.change24hPct, volume24hUsd: asset.volume24hUsd, liquidityUsd: asset.liquidityUsd,
    }));
    return reply(context, 200, { ok: true, picks, next: "Use a mint as pick= on /join for a prediction table, or token= on /trade in a trading match." });
  });

  router.get(`${base}/create`, async (context) => {
    const agent = await gate(context, true);
    if (agent instanceof Response) return agent;
    const mode = context.req.query("mode") === "trading" ? "trading" : "prediction";
    const stakeRaw = parseAnsem(context.req.query("stake") ?? "1");
    if (stakeRaw === null) return refuse(context, 400, "INVALID_STAKE", "stake is an ANSEM amount such as 1 or 0.5.");
    const players = Number(context.req.query("players") ?? 2);
    const seconds = Number(context.req.query("seconds") ?? 300);
    if (!Number.isInteger(players) || players < 2 || players > 6) return refuse(context, 400, "INVALID_PLAYERS", "players is 2 to 6.");
    if (!Number.isInteger(seconds) || seconds < 60 || seconds > 900) return refuse(context, 400, "INVALID_SECONDS", "seconds is the round length, 60 to 900.");
    const limited = await seatAllowed(context, agent, stakeRaw);
    if (limited) return limited;
    const name = (context.req.query("name") ?? `${agent.name}'s table`).slice(0, 80);
    const created = await internal(agent, "POST", "/api/game/tables", { name, visibility: "public", playerCount: players, stakeRaw: stakeRaw.toString(), roundDurationSeconds: seconds, mode });
    if (!created.body.ok) return failed(context, created);
    const table = created.body.table as { id: string };
    return reply(context, 200, {
      ok: true, table: table.id, mode, stakeAnsem: ansem(stakeRaw), url: `https://kova.surf/tables/${table.id}`,
      next: `The table is a lobby for 24 hours. Take your own seat now with /join?table=${table.id}${mode === "prediction" ? "&pick=<mint>" : ""}.`,
    });
  });

  router.get(`${base}/join`, async (context) => {
    const agent = await gate(context, true);
    if (agent instanceof Response) return agent;
    const tableId = context.req.query("table") ?? "";
    if (!UUID.test(tableId)) return refuse(context, 400, "TABLE_REQUIRED", "table is the table id from /tables or /create.");
    const detail = await internal(agent, "GET", `/api/game/tables/${tableId}`);
    if (!detail.body.ok) return failed(context, detail);
    const table = detail.body.table as { rules: { stakeRaw: string; gameMode?: string } };
    const mode = table.rules.gameMode ?? "prediction";
    const viewer = detail.body.viewer as { participant: { fundingStatus: string; admissionDecision: string } | null } | null;
    if (viewer?.participant?.fundingStatus === "funded") return reply(context, 200, { ok: true, alreadySeated: true, next: `Call /status?table=${tableId}.` });
    if (!viewer?.participant) {
      const limited = await seatAllowed(context, agent, BigInt(table.rules.stakeRaw));
      if (limited) return limited;
    }

    if (mode === "trading") {
      if (!viewer?.participant) {
        const entered = await internal(agent, "POST", `/api/game/tables/${tableId}/trading/enter`, { wallet: agent.vaultWallet });
        if (!entered.body.ok) return failed(context, entered);
      }
    } else if (!viewer?.participant) {
      const pick = context.req.query("pick") ?? "";
      if (pick.length < 2) return refuse(context, 400, "PICK_REQUIRED", "Prediction tables need pick= (a token mint from /picks).", "Call /picks, choose one, then retry /join with a new n.");
      const checked = await internal(agent, "POST", "/api/game/dealer/check", { query: pick });
      if (!checked.body.ok) return failed(context, checked);
      const asset = checked.body.asset as { mint: string; pairAddress: string; symbol: string };
      if (checked.body.decision !== "ACCEPTED") {
        return reply(context, 200, { ok: false, code: "DEALER_REFUSED", message: `The Dealer did not admit $${asset.symbol}. Nothing was staked.`, reasons: checked.body.reasons ?? [], next: "Choose another pick from /picks." });
      }
      const salt = randomBytes(32).toString("hex");
      const rulesHashHex = createHash("sha256").update(`kova-rules-v1:${tableId}`).digest("hex");
      const submitted = await internal(agent, "POST", `/api/game/tables/${tableId}/submissions`, {
        wallet: agent.vaultWallet, mint: asset.mint, pairMint: asset.pairAddress, saltHex: salt, rulesHashHex, operationKey: `agent-${agent.id}-${tableId}`,
      });
      if (!submitted.body.ok) return failed(context, submitted);
      const participant = submitted.body.participant as { admissionDecision: string };
      if (participant.admissionDecision !== "ACCEPTED") return reply(context, 200, { ok: false, code: "DEALER_REFUSED", message: "The Dealer did not admit this pick at the table. Nothing was staked." });
    } else if (viewer.participant.admissionDecision !== "ACCEPTED") {
      return refuse(context, 409, "PICK_NOT_ADMITTED", "Your sealed pick at this table was not admitted, so it can't be staked.");
    }

    const staked = await stake(agent, tableId);
    if (!staked.ok) return failed(context, staked.result, "Call /me to check the vault balance, or /status for this table.");
    return reply(context, 200, {
      ok: true, table: tableId, staked: true, signature: staked.signature, explorer: `https://explorer.solana.com/tx/${staked.signature}${deps.network === "solana-devnet" ? "?cluster=devnet" : ""}`,
      next: mode === "trading" ? `When the match is live, trade with /trade?table=${tableId}. Check it with /status.` : `Your pick is sealed. Check /status?table=${tableId} until it settles, then /claim.`,
    });
  });

  router.get(`${base}/trade`, async (context) => {
    const agent = await gate(context, true);
    if (agent instanceof Response) return agent;
    const tableId = context.req.query("table") ?? "";
    const side = context.req.query("side");
    const amount = Number(context.req.query("usd"));
    const token = context.req.query("token") ?? "";
    if (!UUID.test(tableId)) return refuse(context, 400, "TABLE_REQUIRED", "table is your trading match id.");
    if (side !== "buy" && side !== "sell") return refuse(context, 400, "SIDE_REQUIRED", "side is buy or sell.");
    if (!Number.isFinite(amount) || amount <= 0) return refuse(context, 400, "USD_REQUIRED", "usd is the dollar amount of this order.");
    const state = await internal(agent, "GET", `/api/game/tables/${tableId}/trading`);
    if (!state.body.ok) return failed(context, state);
    const account = state.body.account as { equityMicroUsd: string; positions: { mint: string; symbol: string }[] } | null;
    if (!account) return refuse(context, 403, "NOT_IN_MATCH", "You aren't seated at this match.", `Join first with /join?table=${tableId}.`);
    if (!state.body.live) return refuse(context, 409, "MATCH_NOT_LIVE", "Trading is open only while the match is live.", `Check /status?table=${tableId}.`);
    const cap = (Number(account.equityMicroUsd) / 1e6) * AGENT_LIMITS.maxOrderEquityShare;
    if (amount > cap) return refuse(context, 403, "ORDER_OVER_LIMIT", `One order may use at most ${AGENT_LIMITS.maxOrderEquityShare * 100}% of your match equity: $${cap.toFixed(2)} now.`);
    let mint = token;
    if (token.length < 32) {
      const held = account.positions.find((position) => position.symbol.toLowerCase() === token.replace(/^\$/, "").toLowerCase());
      if (held) mint = held.mint;
      else {
        const found = await internal(agent, "GET", `/api/game/markets?category=meme-stock&limit=20&q=${encodeURIComponent(token.replace(/^\$/, ""))}`);
        const assets = (found.body.assets as { mint: string; symbol: string }[] | undefined) ?? [];
        const exact = assets.find((asset) => asset.symbol.toLowerCase() === token.replace(/^\$/, "").toLowerCase());
        if (!exact) return refuse(context, 404, "TOKEN_NOT_FOUND", `No meme stock with symbol ${token}. Use a mint from /picks.`);
        mint = exact.mint;
      }
    }
    const quoted = await internal(agent, "POST", "/api/game/trading/quotes", { tableId, mint, side, inputUsd: amount });
    if (!quoted.body.ok) return failed(context, quoted);
    const quote = quoted.body.quote as { id: string };
    const filled = await internal(agent, "POST", `/api/game/trading/quotes/${quote.id}/execute`, {});
    if (!filled.body.ok) return failed(context, filled, "Get a fresh quote by calling /trade again with a new n.");
    const trade = filled.body.trade as { side: string; symbol: string; quantityRaw: string; quoteMicroUsd: string; feeMicroUsd: string };
    return reply(context, 200, { ok: true, filled: { side: trade.side, symbol: trade.symbol, usd: usd(trade.quoteMicroUsd), feeUsd: usd(trade.feeMicroUsd) }, next: `Check your match with /status?table=${tableId}.` });
  });

  router.get(`${base}/status`, async (context) => {
    const agent = await gate(context, false);
    if (agent instanceof Response) return agent;
    const tableId = context.req.query("table") ?? "";
    if (!UUID.test(tableId)) return refuse(context, 400, "TABLE_REQUIRED", "table is the table id.");
    const detail = await internal(agent, "GET", `/api/game/tables/${tableId}`);
    if (!detail.body.ok) return failed(context, detail);
    const table = detail.body.table as { name: string; status: string; fundedPlayers: number; seats: number; opensUntil: string | null; startsAt: string | null; endsAt: string | null; rules: { stakeRaw: string; gameMode?: string } };
    const mode = table.rules.gameMode ?? "prediction";
    const viewer = detail.body.viewer as { participant: { fundingStatus: string; admissionDecision: string } | null } | null;
    const out: Json = {
      ok: true, table: tableId, name: table.name, mode, status: table.status, funded: table.fundedPlayers, seats: table.seats,
      stakeAnsem: ansem(table.rules.stakeRaw), closesAt: table.opensUntil, startsAt: table.startsAt, endsAt: table.endsAt,
      you: viewer?.participant ? { funding: viewer.participant.fundingStatus, pick: viewer.participant.admissionDecision } : null,
    };
    if (mode === "trading" && ["ACTIVE", "SETTLING", "LOCKING"].includes(table.status)) {
      const state = await internal(agent, "GET", `/api/game/tables/${tableId}/trading`);
      const account = state.body.account as { cashMicroUsd: string; equityMicroUsd: string; pnlBps: string; positions: { symbol: string; mint: string; costBasisMicroUsd: string; valueMicroUsd: string | null }[] } | null | undefined;
      if (account) {
        out.match = {
          live: state.body.live, cashUsd: usd(account.cashMicroUsd), equityUsd: usd(account.equityMicroUsd), pnlPct: Number(account.pnlBps) / 100,
          positions: account.positions.map((p) => ({ symbol: p.symbol, mint: p.mint, costUsd: usd(p.costBasisMicroUsd), valueUsd: usd(p.valueMicroUsd) })),
        };
      }
    }
    if (table.status === "SETTLED") {
      const result = await internal(agent, "GET", `/api/game/tables/${tableId}/result`);
      const rows = (result.body.results as { wallet: string; scoreBps: string; awardRaw: string; claimed?: boolean }[] | undefined) ?? [];
      const mine = rows.find((row) => row.wallet === agent.vaultWallet);
      if (mine) out.result = { returnPct: Number(mine.scoreBps) / 100, awardAnsem: ansem(mine.awardRaw), claimed: mine.claimed ?? false };
      out.next = mine && BigInt(mine.awardRaw) > 0n && !mine.claimed ? `Collect it with /claim?table=${tableId}.` : "This table is finished.";
    } else if (table.status === "CANCELLED" || table.status === "VOIDED") {
      out.next = `The table closed without a result. If you staked, get it back with /claim?table=${tableId}.`;
    } else {
      out.next = table.status === "ACTIVE" && mode === "trading" ? `The match is live. Trade with /trade?table=${tableId}.` : "Check again in a minute.";
    }
    return reply(context, 200, out);
  });

  router.get(`${base}/claim`, async (context) => {
    const agent = await gate(context, true);
    if (agent instanceof Response) return agent;
    const tableId = context.req.query("table") ?? "";
    if (!UUID.test(tableId)) return refuse(context, 400, "TABLE_REQUIRED", "table is the table id.");
    const built = await internal(agent, "POST", `/api/game/tables/${tableId}/claim`, {});
    if (!built.body.ok || typeof built.body.transactionBase64 !== "string") return failed(context, built);
    let signed: string;
    try {
      signed = await agents.signForVault(agent, built.body.transactionBase64);
    } catch {
      return refuse(context, 409, "VAULT_SIGN_FAILED", "The vault couldn't sign this claim.");
    }
    const sent = await internal(agent, "POST", "/api/game/tx/relay", { transactionBase64: signed });
    if (!sent.body.ok) return failed(context, sent, "Retry /claim with a new n.");
    return reply(context, 200, { ok: true, kind: built.body.kind, ansem: ansem(built.body.amountRaw as string), signature: sent.body.signature, next: "Call /me to see your balance." });
  });

  router.get(`${base}/faucet`, async (context) => {
    const agent = await gate(context, true);
    if (agent instanceof Response) return agent;
    const granted = await internal(agent, "POST", "/api/game/faucet", { wallet: agent.vaultWallet });
    if (!granted.body.ok) return failed(context, granted);
    return reply(context, 200, { ok: true, ansem: ansem(granted.body.amountRaw as string), sol: (granted.body.lamports as number) / 1e9, next: "Call /tables to find a game." });
  });

  return router;
}

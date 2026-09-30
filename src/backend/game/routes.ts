import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { findGameTableFixture, getGameCapabilities, listGameTableFixtures } from "./fixtures";
import { gameApiError } from "../../domain/game/api-contracts";
import { bearerFromHeader, type GameAuthVerifier } from "./auth";
import type { DurableGameTable, GamePrincipal, GameRepository } from "./repository";
import type { PublicTable } from "../../domain/game/api-contracts";
import { buildWalletChallenge, verifyWalletSignature } from "./wallet-proof";
import { createPickCommitment, createSealedMarketHash } from "../../domain/game/commitment";
import { decryptPrivateJson, encryptPrivateJson, type PickKeyring } from "./pick-crypto";
import type { GameEventRecord } from "../../domain/game/events";
import { getTradingCapabilities } from "../../domain/trading/api-contracts";
import type { ChainGameErrorCode, ChainGameService } from "./chain-game";
import type { TradingErrorCode, TradingSimService } from "./trading-sim";
import type { SocialService } from "./social";
import type { RelayErrorCode, TxRelay } from "./tx-relay";
import type { PlayerHubService } from "./player-hub";
import type { DealerDeskService } from "./dealer-desk";
import { AGENT_LIMITS, type AgentCreateError, type AgentService } from "./agents";
import type { HouseDesk } from "./house-trader";

/** How long a table waits for its first stake before it closes. Nothing is on chain until then. */
const LOBBY_SECONDS = 24 * 60 * 60;
const PREVIEW_WRITE_MESSAGE ="KOVA game writes are unavailable until private storage, Dealer admission, ANSEM escrow, and settlement gates are proven.";

export interface GameRouterRuntime {
  repository: GameRepository;
  auth: GameAuthVerifier;
  keyring: PickKeyring;
  allowedOrigins: readonly string[];
  stakeMint: string;
  events?: {
    listEvents(input: { tableId: string; afterSequence: bigint; principalId: string | null; limit?: number }): Promise<readonly GameEventRecord[]>;
  };
  /** Present only when an escrow program, network and signing keys are configured. */
  chain?: ChainGameService;
  /** Trade mode's live-price, simulated-fill engine. Present with `chain`. */
  trading?: TradingSimService;
  /** Profiles, leaderboard and showdowns. */
  social?: SocialService;
  /** The signed-in player's notifications, portfolio and challenges. */
  hub?: PlayerHubService;
  /** Sends player-signed game transactions on KOVA's own RPC connection. */
  relay?: TxRelay;
  /** The public record of the Dealer agent's work. */
  dealerDesk?: DealerDeskService;
  /** Player-owned AI agents and their GET-only API (agent-routes.ts). */
  agents?: AgentService;
  /** Public base URL of this API, written into the agent skill. */
  agentApiBaseUrl?: string;
  /** The House trader's public record. */
  houseDesk?: HouseDesk;
}

const CHAIN_ERROR_STATUS: Record<ChainGameErrorCode, 400 | 403 | 404 | 409 | 429 | 503> = {
  TABLE_NOT_FOUND: 404, PARTICIPANT_NOT_FOUND: 404, TABLE_ACCESS_DENIED: 403,
  TABLE_ALREADY_OPEN: 409, TABLE_NOT_OPEN: 409, ADMISSION_NOT_ACCEPTED: 409, PAIR_NOT_FOR_MINT: 400,
  ENTRY_NOT_FUNDED: 409, ENTRY_COMMITMENT_MISMATCH: 409, CLAIM_NOT_AVAILABLE: 409, NOTHING_TO_CLAIM: 409,
  WALLET_MISMATCH: 409, DEALER_UNAVAILABLE: 503, PICK_NOT_FOUND: 404, DEALER_BUDGET_EXHAUSTED: 503,
  FAUCET_UNAVAILABLE: 404, WALLET_NOT_BOUND: 409, FAUCET_ALREADY_CLAIMED: 429, FAUCET_EXHAUSTED: 429, FAUCET_EMPTY: 503,
};

const CHAIN_ERROR_MESSAGE: Record<ChainGameErrorCode, string> = {
  TABLE_NOT_FOUND: "This table does not exist.",
  PARTICIPANT_NOT_FOUND: "You have no pick at this table.",
  TABLE_ACCESS_DENIED: "Only the table host can do that.",
  TABLE_ALREADY_OPEN: "This table is already open on chain.",
  TABLE_NOT_OPEN: "This table is not accepting deposits.",
  ADMISSION_NOT_ACCEPTED: "The Dealer has not accepted this pick, or its decision expired.",
  PAIR_NOT_FOR_MINT: "The chosen market does not trade the picked token.",
  ENTRY_NOT_FUNDED: "No confirmed deposit was found on chain for this wallet yet.",
  ENTRY_COMMITMENT_MISMATCH: "The deposit on chain does not match your stored pick.",
  CLAIM_NOT_AVAILABLE: "Nothing can be claimed until the table settles or times out.",
  NOTHING_TO_CLAIM: "This wallet has nothing left to claim here.",
  WALLET_MISMATCH: "This wallet is not the one bound to your pick.",
  DEALER_UNAVAILABLE: "The Dealer could not review this pick right now. Try again shortly.",
  PICK_NOT_FOUND: "No Solana market was found for that ticker or address. Paste the exact contract address.",
  DEALER_BUDGET_EXHAUSTED: "The Dealer has reached today's review limit. Try again tomorrow.",
  FAUCET_UNAVAILABLE: "Test tokens are only available on devnet.",
  WALLET_NOT_BOUND: "Verify your wallet first, then claim test tokens.",
  FAUCET_ALREADY_CLAIMED: "This wallet or account already claimed test tokens today. Try again tomorrow.",
  FAUCET_EXHAUSTED: "Today's test tokens are all claimed. Try again tomorrow.",
  FAUCET_EMPTY: "The test-token faucet couldn't send right now. Try again shortly.",
};

const FaucetSchema = z.object({ wallet: z.string().min(32).max(44) });

const ConfirmJoinSchema = z.object({ signature: z.string().min(64).max(100) });
const DealerCheckSchema = z.object({ query: z.string().trim().min(1).max(64) });

const FINANCIAL_STATUS: Record<DurableGameTable["status"], PublicTable["financialStatus"]> = {
  DRAFT: "unfunded", OPEN: "unfunded", LOCKING: "funded", ACTIVE: "funded", SETTLING: "funded",
  SETTLED: "result_final", CANCELLED: "refunds_pending", VOIDED: "refunds_pending",
};

/** The public table contract (`PublicTableSchema`); private pick fields never appear here. */
function projectTable(table: DurableGameTable, runtime: GameRouterRuntime): PublicTable {
  const fundedPlayers = table.fundedPlayers ?? 0;
  const financialStatus = table.status === "OPEN" && fundedPlayers > 0 ? "funding_pending" : FINANCIAL_STATUS[table.status];
  return {
    id: table.id,
    name: table.name,
    visibility: table.visibility,
    mode: runtime.chain ? (runtime.chain.network === "solana-mainnet" ? "limited_live" : "devnet") : "preview",
    status: table.status,
    financialStatus,
    fundedPlayers,
    seats: table.rules.playerCount,
    opensUntil: table.opensUntil,
    startsAt: table.startsAt,
    endsAt: table.endsAt,
    rules: table.rules,
    dealer: { required: true, status: runtime.chain?.dealerConfigured ? "ready" : "unavailable", classificationVersion: "kova-admission-v1" },
  };
}

async function viewerAtTable(runtime: GameRouterRuntime, table: DurableGameTable, principalId: string) {
  // Trade seats have no sealed pick, so read the seat itself.
  const participant = await runtime.repository.participantSeat(table.id, principalId);
  return {
    isHost: table.hostPrincipalId === principalId,
    participant: participant ? { wallet: participant.wallet, commitment: participant.commitment, admissionDecision: participant.admissionDecision, fundingStatus: participant.fundingStatus } : null,
  };
}

const SolanaAddress = z.string().min(32).max(44);
const CreateChallengeSchema = z.object({ wallet: SolanaAddress, origin: z.string().url() });
const ProveWalletSchema = z.object({ challengeId: z.uuid(), signatureBase64: z.string().min(1).max(256) });
const CreateTableSchema = z.object({
  name: z.string().trim().min(1).max(80),
  visibility: z.enum(["public", "private"]),
  playerCount: z.number().int().min(2).max(6),
  stakeRaw: z.string().regex(/^[1-9][0-9]*$/).refine((value) => BigInt(value) <= 10_000_000n),
  // The program accepts rounds of 60-900 seconds. Absent means the server default.
  roundDurationSeconds: z.number().int().min(60).max(900).optional(),
  mode: z.enum(["prediction", "trading"]).optional(),
});
const SubmitPickSchema = z.object({
  wallet: SolanaAddress,
  mint: SolanaAddress,
  pairMint: SolanaAddress,
  saltHex: z.string().regex(/^[0-9a-f]{64}$/),
  rulesHashHex: z.string().regex(/^[0-9a-f]{64}$/),
  operationKey: z.string().trim().min(8).max(128),
});
const ClaimInvitationSchema = z.object({ token: z.string().min(32).max(256) });

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function parseJson(context: Context): Promise<unknown | null> {
  try {
    return await context.req.json();
  } catch {
    return null;
  }
}

async function authenticatedPrincipal(context: Context, runtime: GameRouterRuntime): Promise<GamePrincipal | null> {
  const token = bearerFromHeader(context.req.header("authorization"));
  if (!token) return null;
  const authenticated = await runtime.auth.verifyBearer(token);
  return authenticated ? runtime.repository.principalForPrivyUser(authenticated.privyUserId) : null;
}

function unauthorized(context: Context) {
  return context.json(gameApiError("AUTH_REQUIRED", "A valid Privy bearer token is required."), 401);
}

const TradingEnterSchema = z.object({ wallet: z.string().min(32).max(44) });
const RelaySchema = z.object({ transactionBase64: z.string().min(1).max(2_000) });
const RELAY_ERRORS: Record<RelayErrorCode, [400 | 403 | 409 | 502 | 504, string]> = {
  TX_MALFORMED: [400, "That transaction couldn't be read."],
  TX_NOT_ALLOWED: [403, "KOVA only sends its own game transactions."],
  TX_UNSIGNED: [400, "The transaction isn't fully signed."],
  WALLET_NOT_BOUND: [403, "Prove this wallet first."],
  TX_EXPIRED: [409, "That approval took too long and expired. Approve it again."],
  TX_REJECTED: [502, "Solana rejected the transaction. Nothing was sent."],
  TX_UNCONFIRMED: [504, "Sent, but not confirmed yet. It may still land; refresh in a minute."],
};
const ChallengeSchema = z.object({
  opponentUsername: z.string().trim().min(3).max(21),
  mode: z.enum(["prediction", "trading"]),
  stakeRaw: z.string().regex(/^[1-9][0-9]*$/).refine((value) => BigInt(value) <= 10_000_000n),
  roundDurationSeconds: z.number().int().min(60).max(900),
});

/**
 * Every table starts as a lobby: players join and get picks admitted off chain. It opens on chain at
 * the first stake, because the program then allows only ten minutes for the rest to stake.
 */
async function createLobbyTable(runtime: GameRouterRuntime, hostPrincipalId: string, input: {
  name: string; visibility: "public" | "private"; playerCount: number; stakeRaw: string; roundDurationSeconds?: number; mode?: "prediction" | "trading";
}) {
  const table = await runtime.repository.createTable({
    id: randomUUID(), hostPrincipalId, name: input.name, visibility: input.visibility,
    status: "DRAFT", financialStatus: "unfunded", opensUntil: runtime.chain ? new Date(Date.now() + LOBBY_SECONDS * 1_000).toISOString() : null, startsAt: null, endsAt: null,
    rules: {
      playerCount: input.playerCount, stakeMint: runtime.stakeMint, stakeRaw: input.stakeRaw, roundDurationSeconds: input.roundDurationSeconds ?? runtime.chain?.roundSeconds ?? 900,
      scoreVersion: "kova-bps-v1", tieBreakVersion: "wallet-bytes-v1", commitmentVersion: "kova-pick-v1", gameMode: input.mode ?? "prediction",
    },
  });
  if (runtime.chain) await runtime.chain.scheduleLobbyExpiry(table.id, new Date(Date.now() + LOBBY_SECONDS * 1_000));
  return table;
}
const CreateAgentSchema = z.object({ name: z.string().trim().min(1).max(40), username: z.string().trim().min(3).max(20) });
const AGENT_CREATE_ERRORS: Record<AgentCreateError, [400 | 403 | 409, string]> = {
  AGENT_LIMIT_REACHED: [409, `You can run up to ${AGENT_LIMITS.agentsPerOwner} agents. Revoke one first.`],
  USERNAME_INVALID: [400, "Usernames are 3-20 lowercase letters, numbers or underscores."],
  USERNAME_TAKEN: [409, "That username is taken."],
  AGENTS_CANNOT_CREATE_AGENTS: [403, "Agents can't create agents."],
};
const ProfileSchema = z.object({
  username: z.string().trim().min(3).max(20),
  displayName: z.string().max(40).nullable(),
  avatarSeed: z.string().max(64),
});
const TradingQuoteSchema = z.object({
  tableId: z.uuid(),
  mint: z.string().min(32).max(44),
  side: z.enum(["buy", "sell"]),
  inputUsd: z.number().positive().max(1_000_000),
});

const TRADING_ERRORS: Record<TradingErrorCode, [400 | 403 | 404 | 409 | 503, string]> = {
  TABLE_NOT_FOUND: [404, "This table is unavailable."],
  NOT_A_TRADING_TABLE: [409, "This is a Predict table, not a Trade table."],
  TABLE_ACCESS_DENIED: [403, "This table is private. Open it from an invite link."],
  TABLE_FULL: [409, "Every seat at this table is taken."],
  TABLE_NOT_OPEN: [409, "This table is no longer taking players."],
  WALLET_NOT_BOUND: [409, "Prove your wallet first."],
  NOT_IN_MATCH: [403, "You aren't a funded player in this match."],
  MATCH_NOT_LIVE: [409, "Trading is open only while the match is live."],
  PRICE_UNAVAILABLE: [503, "There's no live price for this token right now. Try another."],
  QUOTE_NOT_FOUND: [404, "That quote no longer exists. Get a new one."],
  QUOTE_EXPIRED: [409, "That quote expired. Get a new one."],
  PRICE_MOVED: [409, "The price moved more than 2% against you, so nothing was filled. Review the new price."],
  INSUFFICIENT_BALANCE: [409, "That's more than your match balance."],
  NO_POSITION: [409, "You don't hold this token in this match."],
  INVALID_AMOUNT: [400, "Enter a larger amount."],
  TRADE_NOT_FOUND: [404, "Trade not found."],
};

function tradingError(context: Context, code: TradingErrorCode, detail?: string) {
  const [status, message] = TRADING_ERRORS[code];
  return context.json(gameApiError(code, code === "INVALID_AMOUNT" && detail ? detail : message), status);
}

export function createGameRouter(runtime?: GameRouterRuntime): Hono {
  const router = new Hono();

  router.get("/api/game/capabilities", (context) => {
    if (!runtime) return context.json(getGameCapabilities());
    const chainLive = runtime.chain !== undefined;
    return context.json({
      ...getGameCapabilities(),
      stage: "m3_private_admission",
      // Devnet escrow is real on-chain play with a valueless TEST ANSEM token; the mode says so.
      mode: runtime.chain ? (runtime.chain.network === "solana-mainnet" ? "limited_live" : "devnet") : "preview",
      capabilities: {
        ...getGameCapabilities().capabilities,
        tableDiscovery: "live",
        commitmentConstruction: "live",
        privatePickStorage: "live",
        deterministicScoring: chainLive ? "live" : getGameCapabilities().capabilities.deterministicScoring,
        dealerAdmission: runtime.chain?.dealerConfigured ? "live" : "blocked",
        ansemEscrow: chainLive ? "live" : getGameCapabilities().capabilities.ansemEscrow,
        settlement: chainLive ? "live" : getGameCapabilities().capabilities.settlement,
        payoutExecution: chainLive ? "live" : getGameCapabilities().capabilities.payoutExecution,
      },
    });
  });
  router.get("/api/game/trading/capabilities", (context) => context.json(getTradingCapabilities()));
  // Profiles and rankings. Stats come only from settled tables; X identity only from Privy.
  router.get("/api/game/profile/me", async (context) => {
    if (!runtime?.social) return context.json(gameApiError("PROFILES_UNAVAILABLE", "Profiles aren't available here."), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    return context.json({ ok: true, profile: await runtime.social.ownProfile(principal.id, { refreshX: context.req.query("refreshX") === "1" }) });
  });
  router.post("/api/game/profile/me", async (context) => {
    if (!runtime?.social) return context.json(gameApiError("PROFILES_UNAVAILABLE", "Profiles aren't available here."), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    const parsed = ProfileSchema.safeParse(await parseJson(context));
    if (!parsed.success) return context.json(gameApiError("USERNAME_INVALID", "Use 3 to 20 letters, numbers or underscores."), 400);
    const saved = await runtime.social.saveProfile(principal.id, parsed.data);
    if (!saved.ok) return context.json(gameApiError(saved.code, saved.code === "USERNAME_TAKEN" ? "That username is taken." : "Use 3 to 20 letters, numbers or underscores."), saved.code === "USERNAME_TAKEN" ? 409 : 400);
    return context.json({ ok: true, profile: saved.value });
  });
  router.get("/api/game/profile/username-available", async (context) => {
    if (!runtime?.social) return context.json(gameApiError("PROFILES_UNAVAILABLE", "Profiles aren't available here."), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    return context.json({ ok: true, available: await runtime.social.usernameAvailable(context.req.query("username") ?? "", principal?.id ?? null) });
  });
  router.get("/api/game/profiles/:username", async (context) => {
    if (!runtime?.social) return context.json(gameApiError("PROFILES_UNAVAILABLE", "Profiles aren't available here."), 503);
    const profile = await runtime.social.publicProfile(context.req.param("username"));
    return profile ? context.json({ ok: true, profile }) : context.json(gameApiError("PROFILE_NOT_FOUND", "No player with that username."), 404);
  });
  router.get("/api/game/leaderboard", async (context) => {
    if (!runtime?.social) return context.json(gameApiError("PROFILES_UNAVAILABLE", "Rankings aren't available here."), 503);
    const scope = context.req.query("scope");
    const rows = await runtime.social.leaderboard(scope === "prediction" || scope === "trading" ? scope : "overall");
    return context.json({ ok: true, rows: rows.map((row) => ({ rank: row.rank, identity: row.identity, stats: { ...row.stats, netRaw: row.stats.netRaw.toString() } })) });
  });
  router.get("/api/game/agents", async (context) => {
    const agents = runtime?.agents;
    if (!runtime || !agents) return context.json(gameApiError("AGENTS_UNAVAILABLE", "Agents aren't available here."), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    const owned = await agents.list(principal.id);
    const withBalances = await Promise.all(owned.map(async (agent) => ({ ...agent, balances: agent.revokedAt ? null : await agents.balances(agent) })));
    return context.json({ ok: true, agents: withBalances, limits: { ...AGENT_LIMITS, maxStakeRaw: AGENT_LIMITS.maxStakeRaw.toString() }, skillUrl: `${runtime.agentApiBaseUrl ?? ""}/api/agent/v1/skill` });
  });
  router.post("/api/game/agents", async (context) => {
    if (!runtime?.agents) return context.json(gameApiError("AGENTS_UNAVAILABLE", "Agents aren't available here."), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    const parsed = CreateAgentSchema.safeParse(await parseJson(context));
    if (!parsed.success) return context.json(gameApiError("INVALID_AGENT", "Give the agent a name and a username."), 400);
    const created = await runtime.agents.create({ principalId: principal.id, privyUserId: principal.privyUserId }, parsed.data);
    if (!created.ok) {
      const [status, message] = AGENT_CREATE_ERRORS[created.code];
      return context.json(gameApiError(created.code, message), status);
    }
    // The key is shown once. KOVA keeps only its hash.
    return context.json({ ok: true, agent: created.agent, apiKey: created.apiKey, funded: created.funded, skillUrl: `${runtime.agentApiBaseUrl ?? ""}/api/agent/v1/skill` }, 201);
  });
  router.post("/api/game/agents/:id/revoke", async (context) => {
    if (!runtime?.agents) return context.json(gameApiError("AGENTS_UNAVAILABLE", "Agents aren't available here."), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    const revoked = await runtime.agents.revoke(principal.id, context.req.param("id"));
    return revoked ? context.json({ ok: true }) : context.json(gameApiError("AGENT_NOT_FOUND", "No active agent with that id."), 404);
  });
  router.get("/api/game/house", async (context) => {
    if (!runtime?.houseDesk) return context.json(gameApiError("HOUSE_UNAVAILABLE", "The House isn't available here."), 503);
    context.header("Cache-Control", "public, max-age=15");
    return context.json({ ok: true, ...(await runtime.houseDesk.desk()) });
  });
  router.get("/api/game/dealer/desk", async (context) => {
    if (!runtime?.dealerDesk) return context.json(gameApiError("DEALER_DESK_UNAVAILABLE", "The Dealer desk isn't available here."), 503);
    const limit = Number(context.req.query("limit") ?? 30);
    context.header("Cache-Control", "public, max-age=20");
    return context.json({ ok: true, dealerConfigured: runtime.chain?.dealerConfigured ?? false, ...(await runtime.dealerDesk.desk(Number.isFinite(limit) ? limit : 30)) });
  });
  router.get("/api/game/dealer/feed", async (context) => {
    if (!runtime?.dealerDesk) return context.text("The Dealer desk isn't available here.", 503);
    context.header("Cache-Control", "public, max-age=60");
    return context.text(await runtime.dealerDesk.feed(5));
  });
  router.get("/api/game/players/hot", async (context) => {
    if (!runtime?.social) return context.json(gameApiError("PROFILES_UNAVAILABLE", "Rankings aren't available here."), 503);
    const rows = await runtime.social.hotPlayers();
    return context.json({ ok: true, rows: rows.map((row) => ({ rank: row.rank, identity: row.identity, stats: { ...row.stats, netRaw: row.stats.netRaw.toString() } })) });
  });
  router.get("/api/game/showdowns/recent", async (context) => {
    if (!runtime?.social) return context.json(gameApiError("PROFILES_UNAVAILABLE", "Results aren't available here."), 503);
    return context.json({ ok: true, showdowns: await runtime.social.recentShowdowns() });
  });

  // Trade mode (devnet): live DEX prices, simulated fills, real ANSEM stakes in the escrow.
  router.post("/api/game/tables/:id/trading/enter", async (context) => {
    if (!runtime?.trading) return context.json(gameApiError("TRADING_UNAVAILABLE", "Trade mode isn't available here."), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    const parsed = TradingEnterSchema.safeParse(await parseJson(context));
    if (!parsed.success) return context.json(gameApiError("INVALID_WALLET", "A Solana wallet address is required."), 400);
    const entered = await runtime.trading.enter(context.req.param("id"), principal.id, parsed.data.wallet);
    return entered.ok ? context.json({ ok: true, ...entered.value }) : tradingError(context, entered.code, entered.detail);
  });
  router.get("/api/game/tables/:id/trading", async (context) => {
    if (!runtime?.trading) return context.json(gameApiError("TRADING_UNAVAILABLE", "Trade mode isn't available here."), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    const state = await runtime.trading.matchState(context.req.param("id"), principal?.id ?? null);
    if (!state.ok) return tradingError(context, state.code);
    const identities = runtime.social ? await runtime.social.identitiesForWallets(context.req.param("id"), state.value.standings.map((row) => row.wallet)) : new Map();
    return context.json({ ok: true, ...state.value, standings: state.value.standings.map((row) => ({ ...row, player: identities.get(row.wallet) ?? null })) });
  });
  router.post("/api/game/trading/quotes", async (context) => {
    if (!runtime?.trading) return context.json(gameApiError("TRADING_UNAVAILABLE", "Trade mode isn't available here."), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    const parsed = TradingQuoteSchema.safeParse(await parseJson(context));
    if (!parsed.success) return context.json(gameApiError("INVALID_ORDER", "The order is invalid."), 400);
    const quoted = await runtime.trading.quote(principal.id, parsed.data);
    return quoted.ok ? context.json({ ok: true, quote: quoted.value }) : tradingError(context, quoted.code, "detail" in quoted ? quoted.detail : undefined);
  });
  router.post("/api/game/trading/quotes/:quoteId/execute", async (context) => {
    if (!runtime?.trading) return context.json(gameApiError("TRADING_UNAVAILABLE", "Trade mode isn't available here."), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    const filled = await runtime.trading.execute(principal.id, context.req.param("quoteId"));
    return filled.ok ? context.json({ ok: true, trade: filled.value }) : tradingError(context, filled.code, filled.detail);
  });
  router.get("/api/game/trading/trades/:tradeId", async (context) => {
    if (!runtime?.trading) return context.json(gameApiError("TRADING_UNAVAILABLE", "Trade mode isn't available here."), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    const found = await runtime.trading.trade(principal.id, context.req.param("tradeId"));
    return found.ok ? context.json({ ok: true, trade: found.value }) : tradingError(context, found.code);
  });
  router.post("/api/game/trading/prepare", (context) => context.json(gameApiError("TRADING_PREPARATION_BLOCKED", "Unsigned trade preparation remains blocked until the per-player wallet model and user-authorized signing path are validated.", false), 503));
  router.get("/api/game/tables", async (context) => context.json(runtime
    ? { ok: true, source: "postgres", tables: (await runtime.repository.listPublicTables()).map((table) => projectTable(table, runtime)) }
    : { ok: true, source: "deterministic_fixture", tables: listGameTableFixtures() }));
  router.get("/api/game/tables/:id", async (context) => {
    if (runtime) {
      const principal = await authenticatedPrincipal(context, runtime);
      const table = principal
        ? await runtime.repository.tableForPrincipal(context.req.param("id"), principal.id)
        : (await runtime.repository.listPublicTables()).find((candidate) => candidate.id === context.req.param("id")) ?? null;
      if (!table) return context.json(gameApiError("TABLE_NOT_FOUND", "This table is unavailable or private."), 404);
      const viewer = principal ? await viewerAtTable(runtime, table, principal.id) : null;
      return context.json({ ok: true, source: "postgres", serverTime: new Date().toISOString(), table: projectTable(table, runtime), viewer });
    }
    const table = findGameTableFixture(context.req.param("id"));
    if (table === undefined) return context.json(gameApiError("TABLE_NOT_FOUND", "This table is not in the preview catalog."), 404);
    return context.json({ ok: true, source: "deterministic_fixture", serverTime: new Date().toISOString(), table });
  });

  router.get("/api/game/tables/:id/events", async (context) => {
    if (!runtime?.events) return context.json(gameApiError("EVENT_STREAM_UNAVAILABLE", "Durable game events are unavailable in preview mode."), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    const table = principal
      ? await runtime.repository.tableForPrincipal(context.req.param("id"), principal.id)
      : (await runtime.repository.listPublicTables()).find((candidate) => candidate.id === context.req.param("id")) ?? null;
    if (!table) return context.json(gameApiError("TABLE_NOT_FOUND", "This table is unavailable or private."), 404);
    const rawCursor = context.req.header("last-event-id") ?? context.req.query("after") ?? "0";
    let cursor: bigint;
    try { cursor = BigInt(rawCursor); } catch { return context.json(gameApiError("INVALID_EVENT_CURSOR", "Event cursor must be a non-negative integer."), 400); }
    if (cursor < 0n) return context.json(gameApiError("INVALID_EVENT_CURSOR", "Event cursor must be a non-negative integer."), 400);
    const polls = context.req.query("once") === "true" ? 1 : 25;
    return streamSSE(context, async (stream) => {
      for (let poll = 0; poll < polls && !stream.aborted; poll += 1) {
        const events = await runtime.events!.listEvents({ tableId: table.id, afterSequence: cursor, principalId: principal?.id ?? null });
        for (const event of events) {
          await stream.writeSSE({ id: event.sequence, event: event.eventType, data: JSON.stringify({ sequence: event.sequence, tableId: event.tableId, type: event.eventType, payload: event.payload, createdAt: event.createdAt }) });
          cursor = BigInt(event.sequence);
        }
        if (poll === 0) await stream.writeSSE({ event: "ready", data: JSON.stringify({ serverTime: new Date().toISOString(), cursor: cursor.toString() }), retry: 1_000 });
        if (events.length === 0) await stream.sleep(1_000);
      }
    });
  });

  router.post("/api/game/auth/wallet/challenges", async (context) => {
    if (!runtime) return context.json(gameApiError("WALLET_PROOF_UNAVAILABLE", PREVIEW_WRITE_MESSAGE), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    const parsed = CreateChallengeSchema.safeParse(await parseJson(context));
    if (!parsed.success || !runtime.allowedOrigins.includes(parsed.data.origin)) return context.json(gameApiError("INVALID_WALLET_CHALLENGE", "Wallet and allowed origin are required."), 400);
    const challenge = buildWalletChallenge({ id: randomUUID(), principalId: principal.id, wallet: parsed.data.wallet, origin: parsed.data.origin, now: new Date() });
    await runtime.repository.putWalletChallenge(challenge);
    return context.json({ ok: true, challenge: { id: challenge.id, wallet: challenge.wallet, message: challenge.message, expiresAt: challenge.expiresAt } }, 201);
  });

  router.post("/api/game/auth/wallet/proofs", async (context) => {
    if (!runtime) return context.json(gameApiError("WALLET_PROOF_UNAVAILABLE", PREVIEW_WRITE_MESSAGE), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    const parsed = ProveWalletSchema.safeParse(await parseJson(context));
    if (!parsed.success) return context.json(gameApiError("INVALID_WALLET_PROOF", "Challenge and signature are required."), 400);
    const challenge = await runtime.repository.challengeForProof(parsed.data.challengeId);
    if (!challenge || challenge.principalId !== principal.id || !verifyWalletSignature(challenge.wallet, challenge.message, parsed.data.signatureBase64)) {
      return context.json(gameApiError("INVALID_WALLET_PROOF", "The wallet proof is invalid."), 400);
    }
    const consumed = await runtime.repository.consumeWalletChallenge({ challengeId: challenge.id, principalId: principal.id, wallet: challenge.wallet, now: new Date() });
    if (!consumed.ok) return context.json(gameApiError(consumed.code, "The wallet challenge is unavailable, expired, or already used."), 409);
    return context.json({ ok: true, wallet: challenge.wallet });
  });

  router.post("/api/game/tables", async (context) => {
    if (!runtime) return context.json(gameApiError("TABLE_CREATION_UNAVAILABLE", PREVIEW_WRITE_MESSAGE), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    const parsed = CreateTableSchema.safeParse(await parseJson(context));
    if (!parsed.success) return context.json(gameApiError("INVALID_TABLE", "Table settings are invalid."), 400);
    const table = await createLobbyTable(runtime, principal.id, parsed.data);
    return context.json({ ok: true, table: projectTable(table, runtime) }, 201);
  });

  // A direct challenge: a private two-seat table with the opponent pre-invited and notified.
  router.post("/api/game/challenges", async (context) => {
    if (!runtime?.hub || !runtime.social) return context.json(gameApiError("CHALLENGES_UNAVAILABLE", "Challenges aren't available here."), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    const parsed = ChallengeSchema.safeParse(await parseJson(context));
    if (!parsed.success) return context.json(gameApiError("INVALID_CHALLENGE", "Challenge settings are invalid."), 400);
    const opponent = await runtime.social.principalByUsername(parsed.data.opponentUsername);
    if (!opponent) return context.json(gameApiError("PLAYER_NOT_FOUND", "No player with that username."), 404);
    if (opponent === principal.id) return context.json(gameApiError("CANNOT_CHALLENGE_SELF", "You can't challenge yourself."), 400);
    const from = await runtime.social.usernameOf(principal.id);
    if (!from) return context.json(gameApiError("PROFILE_REQUIRED", "Pick a Kova username before challenging someone."), 409);
    const table = await createLobbyTable(runtime, principal.id, {
      name: `@${from} vs @${parsed.data.opponentUsername.replace(/^@/, "").toLowerCase()}`, visibility: "private", playerCount: 2,
      stakeRaw: parsed.data.stakeRaw, roundDurationSeconds: parsed.data.roundDurationSeconds, mode: parsed.data.mode,
    });
    const challengeId = await runtime.hub.recordChallenge({ tableId: table.id, fromPrincipalId: principal.id, toPrincipalId: opponent });
    return context.json({ ok: true, challengeId, tableId: table.id }, 201);
  });

  router.get("/api/game/notifications", async (context) => {
    if (!runtime?.hub) return context.json(gameApiError("NOTIFICATIONS_UNAVAILABLE", "Notifications aren't available here."), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    return context.json({ ok: true, notifications: await runtime.hub.notifications(principal.id) });
  });
  router.post("/api/game/notifications/read", async (context) => {
    if (!runtime?.hub) return context.json(gameApiError("NOTIFICATIONS_UNAVAILABLE", "Notifications aren't available here."), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    await runtime.hub.markRead(principal.id);
    return context.json({ ok: true });
  });
  router.get("/api/game/portfolio", async (context) => {
    if (!runtime?.hub) return context.json(gameApiError("PORTFOLIO_UNAVAILABLE", "Portfolio isn't available here."), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    return context.json({ ok: true, portfolio: await runtime.hub.portfolio(principal.id, context.req.query("wallet") ?? null) });
  });

  router.post("/api/game/dealer/check", async (context) => {
    if (!runtime?.chain) return context.json(gameApiError("DEALER_UNAVAILABLE", PREVIEW_WRITE_MESSAGE), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    const parsed = DealerCheckSchema.safeParse(await parseJson(context));
    if (!parsed.success) return context.json(gameApiError("INVALID_PICK_QUERY", "Enter a ticker or a Solana contract address."), 400);
    const checked = await runtime.chain.checkPick(principal.id, parsed.data.query);
    if (!checked.ok) return context.json(gameApiError(checked.code, CHAIN_ERROR_MESSAGE[checked.code], checked.code === "DEALER_UNAVAILABLE"), CHAIN_ERROR_STATUS[checked.code]);
    return context.json({ ok: true, ...checked.value });
  });

  router.post("/api/game/faucet", async (context) => {
    if (!runtime?.chain) return context.json(gameApiError("FAUCET_UNAVAILABLE", CHAIN_ERROR_MESSAGE.FAUCET_UNAVAILABLE), 404);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    const parsed = FaucetSchema.safeParse(await parseJson(context));
    if (!parsed.success) return context.json(gameApiError("INVALID_WALLET", "A Solana wallet address is required."), 400);
    const granted = await runtime.chain.grantTestTokens(principal.id, parsed.data.wallet);
    if (!granted.ok) return context.json(gameApiError(granted.code, CHAIN_ERROR_MESSAGE[granted.code], granted.code === "FAUCET_EMPTY"), CHAIN_ERROR_STATUS[granted.code]);
    return context.json({ ok: true, ...granted.value });
  });

  router.get("/api/game/tables/:id/result", async (context) => {
    if (!runtime?.chain) return context.json(gameApiError("SETTLEMENT_UNAVAILABLE", PREVIEW_WRITE_MESSAGE), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    const table = principal
      ? await runtime.repository.tableForPrincipal(context.req.param("id"), principal.id)
      : (await runtime.repository.listPublicTables()).find((candidate) => candidate.id === context.req.param("id")) ?? null;
    if (!table) return context.json(gameApiError("TABLE_NOT_FOUND", "This table is unavailable or private."), 404);
    const result = await runtime.chain.result(table.id);
    if (!result) return context.json(gameApiError("RESULT_NOT_FINAL", "This table has not settled yet."), 409);
    const viewer = principal ? await viewerAtTable(runtime, table, principal.id) : null;
    const identities = runtime.social ? await runtime.social.identitiesForWallets(table.id, result.results.map((row) => row.wallet)) : new Map();
    const results = result.results.map((row) => ({ ...row, player: identities.get(row.wallet) ?? null }));
    return context.json({ ok: true, table: projectTable(table, runtime), ...result, results, viewerWallet: viewer?.participant?.wallet ?? null });
  });

  router.post("/api/game/tables/:id/invitations", async (context) => {
    if (!runtime) return context.json(gameApiError("INVITATIONS_UNAVAILABLE", PREVIEW_WRITE_MESSAGE), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);
    try {
      await runtime.repository.createInvitation({ id: randomUUID(), tableId: context.req.param("id"), creatorPrincipalId: principal.id, tokenHash: hash(token), expiresAt });
    } catch {
      return context.json(gameApiError("TABLE_ACCESS_DENIED", "Only the table host can create an invitation."), 403);
    }
    return context.json({ ok: true, invitation: { token, expiresAt: expiresAt.toISOString() } }, 201);
  });

  router.post("/api/game/invitations/claim", async (context) => {
    if (!runtime) return context.json(gameApiError("INVITATIONS_UNAVAILABLE", PREVIEW_WRITE_MESSAGE), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    const parsed = ClaimInvitationSchema.safeParse(await parseJson(context));
    if (!parsed.success) return context.json(gameApiError("INVITATION_INVALID", "Invitation token is invalid."), 400);
    const claimed = await runtime.repository.claimInvitation({ tokenHash: hash(parsed.data.token), principalId: principal.id, now: new Date() });
    if (!claimed.ok) return context.json(gameApiError(claimed.code, "Invitation is invalid or was claimed by another account."), 409);
    return context.json({ ok: true, tableId: claimed.tableId });
  });

  router.post("/api/game/tables/:id/submissions", async (context) => {
    if (!runtime) return context.json(gameApiError("PICK_SUBMISSION_UNAVAILABLE", PREVIEW_WRITE_MESSAGE), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    const parsed = SubmitPickSchema.safeParse(await parseJson(context));
    if (!parsed.success) return context.json(gameApiError("INVALID_PICK_SUBMISSION", "Pick submission is invalid."), 400);
    const tableId = context.req.param("id");
    const mode = (await runtime.repository.tableForPrincipal(tableId, principal.id))?.rules.gameMode;
    if (mode === "trading") return context.json(gameApiError("NOT_A_PREDICT_TABLE", "This is a Trade table. Take a seat to trade instead of picking."), 409);
    const [commitment, sealedMarketHash] = await Promise.all([
      createPickCommitment({ tableId, wallet: parsed.data.wallet, mint: parsed.data.mint, saltHex: parsed.data.saltHex }),
      createSealedMarketHash({ tableId, wallet: parsed.data.wallet, mint: parsed.data.mint, pairMint: parsed.data.pairMint, saltHex: parsed.data.saltHex, rulesHashHex: parsed.data.rulesHashHex }),
    ]);
    const privatePick = { mint: parsed.data.mint, pairMint: parsed.data.pairMint, saltHex: parsed.data.saltHex, rulesHashHex: parsed.data.rulesHashHex };
    const encryptedRecord = encryptPrivateJson(privatePick, { tableId, principalId: principal.id, kind: "pick" }, runtime.keyring);
    const requestHash = hash(JSON.stringify({ tableId, principalId: principal.id, ...parsed.data, commitment, sealedMarketHash }));
    const result = await runtime.repository.submitParticipant({ id: randomUUID(), principalId: principal.id, tableId, wallet: parsed.data.wallet, commitment, sealedMarketHash, encryptedRecord, operationKey: parsed.data.operationKey, requestHash });
    if (!result.ok) return context.json(gameApiError(result.code, "The private pick could not be accepted."), 409);
    let admissionDecision = "INSUFFICIENT_EVIDENCE";
    let dealer: unknown = null;
    if (runtime.chain && !result.replayed) {
      const admitted = await runtime.chain.admit(tableId, principal.id);
      if (admitted.ok) {
        admissionDecision = admitted.value.decision;
        dealer = admitted.value.publicProjection;
      } else {
        dealer = { code: admitted.code, message: CHAIN_ERROR_MESSAGE[admitted.code] };
      }
    }
    return context.json({ ok: true, replayed: result.replayed, participant: { tableId, wallet: parsed.data.wallet, commitment, sealedMarketHash, admissionDecision, fundingStatus: "unfunded" }, dealer }, result.replayed ? 200 : 201);
  });

  router.post("/api/game/tables/:id/open", async (context) => {
    if (!runtime?.chain) return context.json(gameApiError("TABLE_OPEN_UNAVAILABLE", PREVIEW_WRITE_MESSAGE), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    const opened = await runtime.chain.openTable(context.req.param("id"), principal.id);
    if (!opened.ok) return context.json(gameApiError(opened.code, CHAIN_ERROR_MESSAGE[opened.code]), CHAIN_ERROR_STATUS[opened.code]);
    return context.json({ ok: true, ...opened.value }, 201);
  });

  router.post("/api/game/tables/:id/join", async (context) => {
    if (!runtime?.chain) return context.json(gameApiError("TABLE_JOIN_UNAVAILABLE", PREVIEW_WRITE_MESSAGE), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    const built = await runtime.chain.buildJoin(context.req.param("id"), principal.id);
    if (!built.ok) return context.json(gameApiError(built.code, CHAIN_ERROR_MESSAGE[built.code]), CHAIN_ERROR_STATUS[built.code]);
    return context.json({ ok: true, ...built.value, instruction: "Sign and submit with your wallet, then call /join/confirm with the signature." });
  });

  // The wallet signs; KOVA sends. See tx-relay.ts for what is (and isn't) accepted.
  router.post("/api/game/tx/relay", async (context) => {
    if (!runtime?.relay) return context.json(gameApiError("RELAY_UNAVAILABLE", "Sending isn't available here. Your wallet can send it instead."), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    const parsed = RelaySchema.safeParse(await parseJson(context));
    if (!parsed.success) return context.json(gameApiError("TX_MALFORMED", "That transaction couldn't be read."), 400);
    const relayed = await runtime.relay.relay(principal.id, parsed.data.transactionBase64);
    if (relayed.ok) return context.json({ ok: true, signature: relayed.signature });
    const [status, message] = RELAY_ERRORS[relayed.code];
    return context.json({ ...gameApiError(relayed.code, message, relayed.code === "TX_EXPIRED" || relayed.code === "TX_UNCONFIRMED"), detail: relayed.detail ?? null }, status);
  });

  router.post("/api/game/tables/:id/join/confirm", async (context) => {
    if (!runtime?.chain) return context.json(gameApiError("TABLE_JOIN_UNAVAILABLE", PREVIEW_WRITE_MESSAGE), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    const parsed = ConfirmJoinSchema.safeParse(await parseJson(context));
    if (!parsed.success) return context.json(gameApiError("INVALID_SIGNATURE", "A transaction signature is required."), 400);
    const confirmed = await runtime.chain.confirmJoin(context.req.param("id"), principal.id, parsed.data.signature);
    if (!confirmed.ok) return context.json(gameApiError(confirmed.code, CHAIN_ERROR_MESSAGE[confirmed.code]), CHAIN_ERROR_STATUS[confirmed.code]);
    return context.json({ ok: true, ...confirmed.value });
  });

  router.post("/api/game/tables/:id/claim", async (context) => {
    if (!runtime?.chain) return context.json(gameApiError("CLAIM_UNAVAILABLE", PREVIEW_WRITE_MESSAGE), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    const built = await runtime.chain.buildClaim(context.req.param("id"), principal.id);
    if (!built.ok) return context.json(gameApiError(built.code, CHAIN_ERROR_MESSAGE[built.code]), CHAIN_ERROR_STATUS[built.code]);
    return context.json({ ok: true, ...built.value });
  });

  router.get("/api/game/tables/:id/private", async (context) => {
    if (!runtime) return context.json(gameApiError("PRIVATE_VIEW_UNAVAILABLE", "Private participant state is unavailable in preview mode."), 503);
    const principal = await authenticatedPrincipal(context, runtime);
    if (!principal) return unauthorized(context);
    const participant = await runtime.repository.privateParticipant(context.req.param("id"), principal.id);
    if (!participant) return context.json(gameApiError("PRIVATE_PARTICIPANT_NOT_FOUND", "No private participant state exists for this account."), 404);
    const pick = decryptPrivateJson<{ mint: string; pairMint: string }>(participant.encryptedRecord, { tableId: participant.tableId, principalId: principal.id, kind: "pick" }, runtime.keyring);
    return context.json({ ok: true, participant: { tableId: participant.tableId, wallet: participant.wallet, commitment: participant.commitment, sealedMarketHash: participant.sealedMarketHash, admissionDecision: participant.admissionDecision, fundingStatus: participant.fundingStatus, candidateMint: pick.mint, pairMint: pick.pairMint } });
  });

  // Reveal and settlement are not client actions: the worker captures prices and settles on chain.
  router.post("/api/game/tables/:id/reveal", (context) => context.json(gameApiError("PICK_REVEAL_UNAVAILABLE", "Picks are revealed automatically at showdown."), 409));
  router.post("/api/game/tables/:id/settle", (context) => context.json(gameApiError("SETTLEMENT_UNAVAILABLE", "Settlement runs automatically when the round ends."), 409));

  return router;
}

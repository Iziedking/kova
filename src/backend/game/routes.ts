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
  const participant = await runtime.repository.privateParticipant(table.id, principalId);
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
  router.post("/api/game/trading/quotes", (context) => context.json(gameApiError("TRADING_QUOTES_UNAVAILABLE", "Trading quotes remain unavailable until a ClawPump account and per-player execution authority are approved.", true), 503));
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
    // A new table is a lobby: players join and get picks admitted off chain. It opens on chain at the
    // first stake, because the program then allows only ten minutes for the rest to stake.
    const table = await runtime.repository.createTable({
      id: randomUUID(), hostPrincipalId: principal.id, name: parsed.data.name, visibility: parsed.data.visibility,
      status: "DRAFT", financialStatus: "unfunded", opensUntil: runtime.chain ? new Date(Date.now() + LOBBY_SECONDS * 1_000).toISOString() : null, startsAt: null, endsAt: null,
      rules: { playerCount: parsed.data.playerCount, stakeMint: runtime.stakeMint, stakeRaw: parsed.data.stakeRaw, roundDurationSeconds: parsed.data.roundDurationSeconds ?? runtime.chain?.roundSeconds ?? 900, scoreVersion: "kova-bps-v1", tieBreakVersion: "wallet-bytes-v1", commitmentVersion: "kova-pick-v1" },
    });
    if (runtime.chain) await runtime.chain.scheduleLobbyExpiry(table.id, new Date(Date.now() + LOBBY_SECONDS * 1_000));
    return context.json({ ok: true, table: projectTable(table, runtime) }, 201);
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
    return context.json({ ok: true, table: projectTable(table, runtime), ...result, viewerWallet: viewer?.participant?.wallet ?? null });
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

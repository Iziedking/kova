import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { findGameTableFixture, getGameCapabilities, listGameTableFixtures } from "./fixtures";
import { gameApiError } from "../../domain/game/api-contracts";
import { bearerFromHeader, type GameAuthVerifier } from "./auth";
import type { GamePrincipal, GameRepository } from "./repository";
import { buildWalletChallenge, verifyWalletSignature } from "./wallet-proof";
import { createPickCommitment, createSealedMarketHash } from "../../domain/game/commitment";
import { decryptPrivateJson, encryptPrivateJson, type PickKeyring } from "./pick-crypto";
import type { GameEventRecord } from "../../domain/game/events";

const PREVIEW_WRITE_MESSAGE = "KOVA game writes are unavailable until private storage, Dealer admission, ANSEM escrow, and settlement gates are proven.";

export interface GameRouterRuntime {
  repository: GameRepository;
  auth: GameAuthVerifier;
  keyring: PickKeyring;
  allowedOrigins: readonly string[];
  stakeMint: string;
  events?: {
    listEvents(input: { tableId: string; afterSequence: bigint; principalId: string | null; limit?: number }): Promise<readonly GameEventRecord[]>;
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

  router.get("/api/game/capabilities", (context) => context.json(runtime ? {
    ...getGameCapabilities(),
    stage: "m3_private_admission",
    capabilities: { ...getGameCapabilities().capabilities, tableDiscovery: "live", commitmentConstruction: "live", privatePickStorage: "live" },
  } : getGameCapabilities()));
  router.get("/api/game/tables", async (context) => context.json(runtime
    ? { ok: true, source: "postgres", tables: await runtime.repository.listPublicTables() }
    : { ok: true, source: "deterministic_fixture", tables: listGameTableFixtures() }));
  router.get("/api/game/tables/:id", async (context) => {
    if (runtime) {
      const principal = await authenticatedPrincipal(context, runtime);
      const table = principal
        ? await runtime.repository.tableForPrincipal(context.req.param("id"), principal.id)
        : (await runtime.repository.listPublicTables()).find((candidate) => candidate.id === context.req.param("id")) ?? null;
      if (!table) return context.json(gameApiError("TABLE_NOT_FOUND", "This table is unavailable or private."), 404);
      return context.json({ ok: true, source: "postgres", serverTime: new Date().toISOString(), table });
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
    const table = await runtime.repository.createTable({
      id: randomUUID(), hostPrincipalId: principal.id, name: parsed.data.name, visibility: parsed.data.visibility,
      status: "DRAFT", financialStatus: "unfunded", opensUntil: null, startsAt: null, endsAt: null,
      rules: { playerCount: parsed.data.playerCount, stakeMint: runtime.stakeMint, stakeRaw: parsed.data.stakeRaw, roundDurationSeconds: 900, scoreVersion: "kova-bps-v1", tieBreakVersion: "wallet-bytes-v1", commitmentVersion: "kova-pick-v1" },
    });
    return context.json({ ok: true, table }, 201);
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
    return context.json({ ok: true, replayed: result.replayed, participant: { tableId, wallet: parsed.data.wallet, commitment, sealedMarketHash, admissionDecision: "INSUFFICIENT_EVIDENCE", fundingStatus: "unfunded" } }, result.replayed ? 200 : 201);
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

  router.post("/api/game/tables/:id/join", (context) => context.json(gameApiError("TABLE_JOIN_UNAVAILABLE", PREVIEW_WRITE_MESSAGE), 503));
  router.post("/api/game/tables/:id/reveal", (context) => context.json(gameApiError("PICK_REVEAL_UNAVAILABLE", PREVIEW_WRITE_MESSAGE), 503));
  router.post("/api/game/tables/:id/settle", (context) => context.json(gameApiError("SETTLEMENT_UNAVAILABLE", PREVIEW_WRITE_MESSAGE), 503));

  return router;
}

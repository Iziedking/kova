/**
 * The Prediction game's money path against the live backend.
 *
 *   join       prove the wallet (one message signature, no transaction)
 *   check      Dealer reviews the exact token before anything is committed
 *   lock       private commitment -> Dealer admission -> deposit signed by the player's wallet
 *   claim      payout or refund, signed by the player's wallet
 *
 * Every wallet prompt is the player's own approval. The backend co-signs deposits only
 * for picks the Dealer admitted, and records funding only after reading it back on chain.
 */
import { z } from "zod";
import { apiRequest } from "@/services/api/http";
import { fail, ok, type GameWallet, type ServiceContext, type ServiceResult } from "@/types/service";
import type { MarketAsset } from "@/types/market";
import type { PredictionViewerState } from "@/types/competition";

const ORIGIN_UNAVAILABLE = "Wallet actions need a browser.";

const ChallengeResponse = z.object({ ok: z.literal(true), challenge: z.object({ id: z.string(), message: z.string() }) });
const ProofResponse = z.object({ ok: z.literal(true), wallet: z.string() });
const DealerCheckResponse = z.object({
  ok: z.literal(true),
  asset: z.object({
    mint: z.string(), pairAddress: z.string(), symbol: z.string(), name: z.string(), imageUrl: z.string().nullable(),
    priceUsd: z.number().nullable(), change24hPct: z.number().nullable(), volume24hUsd: z.number().nullable(), liquidityUsd: z.number().nullable(),
  }),
  decision: z.enum(["ACCEPTED", "REJECTED", "INSUFFICIENT_EVIDENCE"]),
  confidence: z.number().nullable(),
  reasons: z.array(z.string()),
});
const SubmissionResponse = z.object({
  ok: z.literal(true),
  participant: z.object({ commitment: z.string(), admissionDecision: z.string(), fundingStatus: z.string() }),
  dealer: z.unknown(),
});
const JoinResponse = z.object({ ok: z.literal(true), transactionBase64: z.string() });
const ConfirmResponse = z.object({ ok: z.literal(true), fundedPlayers: z.number(), tableFull: z.boolean() });
const ClaimResponse = z.object({ ok: z.literal(true), kind: z.enum(["payout", "refund"]), amountRaw: z.string(), transactionBase64: z.string() });

/** Pair chosen by the Dealer check, remembered so the lock prices the same market the player saw. */
const checkedPairs = new Map<string, string>();
/** Wallets proven in this browser session, so a player signs the ownership message once. */
const provenWallets = new Set<string>();

function requireWallet(ctx: ServiceContext | undefined): GameWallet | ServiceResult<never> {
  if (!ctx?.wallet) return fail({ code: "AUTH_REQUIRED", message: "Connect a Solana wallet that can sign to play for stakes.", retryable: false });
  return ctx.wallet;
}

function isFailure<T>(value: T | ServiceResult<never>): value is ServiceResult<never> {
  return typeof value === "object" && value !== null && "ok" in value && (value as { ok: unknown }).ok === false;
}

function walletRejected(error: unknown): ServiceResult<never> {
  const message = error instanceof Error && /reject|denied|cancel/i.test(error.message)
    ? "You cancelled the request in your wallet. Nothing was sent."
    : "Your wallet couldn't complete that. Nothing was sent.";
  return fail({ code: "HTTP", message, retryable: true });
}

function randomHex32(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Proves wallet ownership to the backend with a message signature. Never a transaction. */
export async function proveWallet(ctx: ServiceContext | undefined): Promise<ServiceResult<{ wallet: string }>> {
  const wallet = requireWallet(ctx);
  if (isFailure(wallet)) return wallet;
  if (provenWallets.has(wallet.address)) return ok({ wallet: wallet.address }, "api");
  if (typeof window === "undefined") return fail({ code: "UNAVAILABLE", message: ORIGIN_UNAVAILABLE, retryable: false });
  const challenge = await apiRequest("/api/game/auth/wallet/challenges", ChallengeResponse, ctx, { method: "POST", auth: true, body: { wallet: wallet.address, origin: window.location.origin } });
  if (!challenge.ok) return challenge;
  let signatureBase64: string;
  try {
    signatureBase64 = await wallet.signMessage(challenge.data.challenge.message);
  } catch (error) {
    return walletRejected(error);
  }
  const proof = await apiRequest("/api/game/auth/wallet/proofs", ProofResponse, ctx, { method: "POST", auth: true, body: { challengeId: challenge.data.challenge.id, signatureBase64 } });
  if (!proof.ok) return proof;
  provenWallets.add(wallet.address);
  return ok({ wallet: wallet.address }, "api");
}

export async function checkPick(query: string, ctx: ServiceContext | undefined): Promise<ServiceResult<{ asset: MarketAsset; eligible: boolean; reason: string | null }>> {
  const result = await apiRequest("/api/game/dealer/check", DealerCheckResponse, ctx, { method: "POST", auth: true, body: { query } });
  if (!result.ok) return result;
  const { asset, decision, reasons } = result.data;
  checkedPairs.set(asset.mint, asset.pairAddress);
  const eligible = decision === "ACCEPTED";
  const reason = eligible ? null : reasons[0] ?? (decision === "REJECTED" ? "The Dealer rejected this token for Prediction tables." : "The Dealer couldn't find enough evidence to admit this token.");
  const marketAsset: MarketAsset = {
    mint: asset.mint, symbol: asset.symbol, name: asset.name, imageUrl: asset.imageUrl,
    priceUsd: asset.priceUsd, change24hPct: asset.change24hPct, volume24hUsd: asset.volume24hUsd, liquidityUsd: asset.liquidityUsd,
    source: "other",
    eligibility: { prediction: eligible, trading: false, reason },
  };
  return ok({ asset: marketAsset, eligible, reason }, "api");
}

async function waitForFunding(tableId: string, signature: string, ctx: ServiceContext | undefined): Promise<ServiceResult<{ fundedPlayers: number }>> {
  // The deposit is final only when the backend reads the entry back from chain. Allow for devnet latency.
  let last: ServiceResult<z.infer<typeof ConfirmResponse>> | null = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    last = await apiRequest(`/api/game/tables/${encodeURIComponent(tableId)}/join/confirm`, ConfirmResponse, ctx, { method: "POST", auth: true, body: { signature } });
    if (last.ok) return ok({ fundedPlayers: last.data.fundedPlayers }, "api");
    await new Promise((resolve) => setTimeout(resolve, 2_500));
  }
  return fail({
    code: "HTTP",
    message: `Your deposit was sent (${signature.slice(0, 8)}…) but isn't confirmed yet. Refresh in a minute; if the table expires unfunded you can claim a refund.`,
    retryable: true,
  });
}

/** Commit the pick privately, get it admitted, then stake. Two wallet prompts at most. */
export async function lockAndStake(tableId: string, mint: string, current: PredictionViewerState | null, ctx: ServiceContext | undefined): Promise<ServiceResult<{ fundedPlayers: number }>> {
  const wallet = requireWallet(ctx);
  if (isFailure(wallet)) return wallet;
  const proven = await proveWallet(ctx);
  if (!proven.ok) return proven;

  // An admitted but unfunded pick from an earlier attempt is reused; picks cannot be swapped.
  if (!current || current.admission === null) {
    const pairMint = checkedPairs.get(mint);
    if (!pairMint) return fail({ code: "HTTP", message: "Check the pick with the Dealer first.", retryable: false });
    const submitted = await apiRequest(`/api/game/tables/${encodeURIComponent(tableId)}/submissions`, SubmissionResponse, ctx, {
      method: "POST",
      auth: true,
      body: { wallet: wallet.address, mint, pairMint, saltHex: randomHex32(), rulesHashHex: await sha256Hex(`kova-rules-v1:${tableId}`), operationKey: `pick-${tableId}-${randomHex32().slice(0, 16)}` },
    });
    if (!submitted.ok) return submitted;
    if (submitted.data.participant.admissionDecision !== "ACCEPTED") {
      return fail({ code: "HTTP", message: "The Dealer did not admit this pick, so no stake was requested.", retryable: false });
    }
  } else if (current.admission !== "accepted") {
    return fail({ code: "HTTP", message: "Your committed pick was not admitted, so it can't be staked.", retryable: false });
  }

  const join = await apiRequest(`/api/game/tables/${encodeURIComponent(tableId)}/join`, JoinResponse, ctx, { method: "POST", auth: true, body: {} });
  if (!join.ok) return join;
  let signature: string;
  try {
    signature = await wallet.signAndSend(join.data.transactionBase64);
  } catch (error) {
    return walletRejected(error);
  }
  return waitForFunding(tableId, signature, ctx);
}

const EnterResponse = z.object({ ok: z.literal(true), wallet: z.string() });

/** Trade mode: take a seat (no Dealer pick) and stake. One wallet message, one deposit. */
export async function enterTradingAndStake(tableId: string, ctx: ServiceContext | undefined): Promise<ServiceResult<{ fundedPlayers: number }>> {
  const wallet = requireWallet(ctx);
  if (isFailure(wallet)) return wallet;
  const proven = await proveWallet(ctx);
  if (!proven.ok) return proven;
  const entered = await apiRequest(`/api/game/tables/${encodeURIComponent(tableId)}/trading/enter`, EnterResponse, ctx, { method: "POST", auth: true, body: { wallet: wallet.address } });
  if (!entered.ok) return entered;
  const join = await apiRequest(`/api/game/tables/${encodeURIComponent(tableId)}/join`, JoinResponse, ctx, { method: "POST", auth: true, body: {} });
  if (!join.ok) return join;
  let signature: string;
  try {
    signature = await wallet.signAndSend(join.data.transactionBase64);
  } catch (error) {
    return walletRejected(error);
  }
  return waitForFunding(tableId, signature, ctx);
}

const FaucetResponse =z.object({ ok: z.literal(true), signature: z.string(), amountRaw: z.string(), lamports: z.number() });

/** Devnet only: TEST ANSEM plus fee SOL to the viewer's proven wallet, once a day. */
export async function claimTestTokens(ctx: ServiceContext | undefined): Promise<ServiceResult<{ signature: string; amountRaw: string; lamports: number }>> {
  const proven = await proveWallet(ctx);
  if (!proven.ok) return proven;
  return apiRequest("/api/game/faucet", FaucetResponse, ctx, { method: "POST", auth: true, body: { wallet: proven.data.wallet } });
}

export async function claim(tableId: string, ctx: ServiceContext | undefined): Promise<ServiceResult<{ kind: "payout" | "refund"; amountRaw: string; signature: string }>> {
  const wallet = requireWallet(ctx);
  if (isFailure(wallet)) return wallet;
  const built = await apiRequest(`/api/game/tables/${encodeURIComponent(tableId)}/claim`, ClaimResponse, ctx, { method: "POST", auth: true, body: {} });
  if (!built.ok) return built;
  try {
    const signature = await wallet.signAndSend(built.data.transactionBase64);
    return ok({ kind: built.data.kind, amountRaw: built.data.amountRaw, signature }, "api");
  } catch (error) {
    return walletRejected(error);
  }
}

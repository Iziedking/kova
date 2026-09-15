/** User-owned position review contract. It produces no transaction bytes. Reviewed 2026-09-15. */
import { PublicKey } from "@solana/web3.js";
import type { Result } from "./contracts";
import type { SizedQuoteCoverageStatus } from "./sized-quote";

export const POSITION_REVIEW_EVIDENCE_MAX_AGE_MS = 5 * 60 * 1000;

export interface PositionIntentInput {
  wallet: string;
  marketId: string;
  campaignId: string;
  capitalUsdMicro: string;
  maxSlippageBps: number;
  tickLower: number;
  tickUpper: number;
  expiresAt: string;
  phase00Status: "blocked" | "ready";
  phase00ReportHash: string | null;
  phase00ObservedAt: string | null;
  quoteStatus: SizedQuoteCoverageStatus;
  quoteReportHash: string | null;
  quoteObservedAt: string | null;
}

export interface PositionIntentReview {
  status: "blocked" | "ready_for_simulation";
  signingAllowed: false;
  transactionBase64: null;
  wallet: string;
  marketId: string;
  campaignId: string;
  capitalUsdMicro: string;
  maxSlippageBps: number;
  range: { tickLower: number; tickUpper: number };
  expiresAt: string;
  evidence: {
    phase00ReportHash: string | null;
    quoteReportHash: string | null;
    phase00ObservedAt: string | null;
    quoteObservedAt: string | null;
  };
  blockers: readonly string[];
}

function validWallet(wallet: string): boolean {
  try {
    new PublicKey(wallet);
    return true;
  } catch {
    return false;
  }
}

function validHash(hash: string | null): boolean {
  return hash !== null && /^[a-f0-9]{64}$/i.test(hash);
}

function isFresh(observedAt: string | null, nowMs: number): boolean {
  if (observedAt === null) return false;
  const observedMs = Date.parse(observedAt);
  return Number.isFinite(observedMs) && observedMs <= nowMs && nowMs - observedMs <= POSITION_REVIEW_EVIDENCE_MAX_AGE_MS;
}

export function reviewPositionIntent(input: PositionIntentInput, nowMs = Date.now()): Result<PositionIntentReview> {
  if (!validWallet(input.wallet)) return { ok: false, code: "INVALID_WALLET", message: "The position review needs a valid Solana wallet address.", retryable: false };
  if (!input.marketId || !input.campaignId) return { ok: false, code: "INCOMPLETE_POSITION_INTENT", message: "Market and campaign identity are required.", retryable: false };
  if (!/^\d+$/.test(input.capitalUsdMicro) || BigInt(input.capitalUsdMicro) <= 0n) return { ok: false, code: "INVALID_CAPITAL", message: "Capital must be a positive integer number of USD micro-units.", retryable: false };
  if (!Number.isInteger(input.maxSlippageBps) || input.maxSlippageBps < 0 || input.maxSlippageBps > 10_000) return { ok: false, code: "INVALID_SLIPPAGE", message: "Slippage must be an integer between 0 and 10,000 basis points.", retryable: false };
  if (!Number.isInteger(input.tickLower) || !Number.isInteger(input.tickUpper) || input.tickLower >= input.tickUpper) return { ok: false, code: "INVALID_RANGE", message: "The lower tick must be below the upper tick.", retryable: false };
  if (!Number.isFinite(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) <= nowMs) return { ok: false, code: "EXPIRED_INTENT", message: "The position review must expire in the future.", retryable: false };

  const blockers: string[] = [];
  if (input.phase00Status === "blocked") blockers.push("Phase 00 feasibility is blocked. FLOAT cannot prepare or request a user signature.");
  if (!validHash(input.phase00ReportHash)) blockers.push("A valid feasibility report hash is required before a position can be reviewed.");
  if (!isFresh(input.phase00ObservedAt, nowMs)) blockers.push("The feasibility report is missing or older than the five-minute review window.");
  if (input.quoteStatus !== "complete") blockers.push("A complete sized quote is required before exact token debits and minimum receives can be reviewed.");
  if (!validHash(input.quoteReportHash)) blockers.push("A valid sized-quote report hash is required before a position can be reviewed.");
  if (!isFresh(input.quoteObservedAt, nowMs)) blockers.push("The sized quote is missing or older than the five-minute review window.");
  return {
    ok: true,
    value: {
      status: blockers.length > 0 ? "blocked" : "ready_for_simulation",
      signingAllowed: false,
      transactionBase64: null,
      wallet: input.wallet,
      marketId: input.marketId,
      campaignId: input.campaignId,
      capitalUsdMicro: input.capitalUsdMicro,
      maxSlippageBps: input.maxSlippageBps,
      range: { tickLower: input.tickLower, tickUpper: input.tickUpper },
      expiresAt: input.expiresAt,
      evidence: {
        phase00ReportHash: input.phase00ReportHash,
        quoteReportHash: input.quoteReportHash,
        phase00ObservedAt: input.phase00ObservedAt,
        quoteObservedAt: input.quoteObservedAt,
      },
      blockers,
    },
  };
}

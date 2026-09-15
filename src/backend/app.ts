import { cors } from "hono/cors";
import { Hono } from "hono";
import { buildInitialStockCheck, buildUnderwritingFixture, findCampaignFixture, findMarketFixture, listCampaignFixtures, listMarketFixtures } from "./fixtures";
import type { BackendConfig } from "./config";
import { buildPhase00Report } from "../domain/phase00-feasibility";
import { createEvidenceStore, type EvidenceStore } from "./evidence-store";
import { reconcileInitialStockCheck } from "./reconciliation";
import type { StockCheckReport } from "../domain/stock-check";
import { buildCampaignFeed } from "../domain/campaign-marketplace";
import { reviewPositionIntent } from "../domain/position-intent";
import { Connection, PublicKey } from "@solana/web3.js";
import { readCandidateSizedQuote } from "../adapters/raydium-quote-read";
import { readFloatMonitor } from "../adapters/solana-float-read";
import { hashEvidence } from "./evidence";
import { z } from "zod";
import { marketById } from "../domain/market-catalog";

interface ApiError {
  ok: false;
  code: string;
  message: string;
  retryable: boolean;
}

function apiError(code: string, message: string, retryable = false): ApiError {
  return { ok: false, code, message, retryable };
}

const PositionReviewSchema = z.object({
  wallet: z.string().trim().min(1),
  marketId: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
  capitalUsdMicro: z.string().regex(/^\d+$/),
  maxSlippageBps: z.number().int().min(0).max(10_000),
  tickLower: z.number().int(),
  tickUpper: z.number().int(),
  expiresAt: z.string().datetime(),
});

const SolanaAddressSchema = z.string().trim().min(1).refine((value) => {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}, "Invalid Solana address");

const SizedQuoteQuerySchema = z.object({
  amountInRaw: z.string().regex(/^[1-9][0-9]*$/),
  inputMint: SolanaAddressSchema,
  slippageBps: z.coerce.number().int().min(0).max(10_000).default(100),
});

export function createBackendApp(config: BackendConfig, evidenceStore: EvidenceStore = createEvidenceStore(config.databaseUrl)): Hono {
  const app = new Hono();

  app.use("*", cors({ origin: config.allowedOrigins.length > 0 ? [...config.allowedOrigins] : "http://localhost:3000" }));

  app.get("/api/health", (context) => context.json({
    product: "FLOAT",
    mode: config.mode,
    status: "ok",
    capabilities: {
      database: config.databaseUrl === null ? "preview_memory" : "configured_not_verified",
      finalizedRpc: config.solanaRpcUrl === null ? "fixture" : "configured_not_verified",
      marketReads: "captured_snapshot",
      stockCheck: "fixture_backed",
      stockFloatMonitor: config.solanaRpcUrl === null ? "unavailable" : "finalized_read_available",
      campaigns: "captured_snapshot",
      underwriting: "preview_only",
      walletConnection: "browser_seam_only",
      paidResearch: "unavailable",
      walletSigning: "unavailable",
      transactionPreparation: "unavailable",
      automatedRebalancing: "unavailable",
    },
  }));

  app.get("/api/capabilities", (context) => context.json({
    product: "FLOAT",
    stage: "group5_wallet_review",
    mode: config.mode,
    capabilities: {
      phase00Feasibility: "blocked",
      marketReads: "captured_snapshot",
      stockCheck: "fixture_backed",
      stockFloatMonitor: config.solanaRpcUrl === null ? "unavailable" : "finalized_read_available",
      campaigns: "captured_snapshot",
      underwriting: "preview_only",
      walletConnection: "browser_seam_only",
      positionIntentReview: "preview_only",
      paidResearch: "unavailable",
      transactionPreparation: "unavailable",
      walletSigning: "unavailable",
      automatedRebalancing: "unavailable",
    },
  }));

  app.get("/api/markets", (context) => context.json({
    ok: true,
    source: "captured_snapshot",
    markets: listMarketFixtures(),
  }));

  app.get("/api/markets/:id", async (context) => {
    const market = findMarketFixture(context.req.param("id"));
    if (market === undefined) return context.json(apiError("MARKET_NOT_FOUND", "This market is not in the supported registry."), 404);
    const campaign = listCampaignFixtures().find((candidate) => candidate.marketId === market.id) ?? null;
    const stockCheck = buildInitialStockCheck(market.id);
    const underwriting = buildUnderwritingFixture(market.id);
    const feasibility = market.id === "nvdge-nvdax" ? buildPhase00Report() : null;
    const floatMonitor = config.solanaRpcUrl === null
      ? {
        capability: "unavailable" as const,
        report: null,
        reason: "FLOAT_MONITOR_READ_UNAVAILABLE",
      }
      : await readFloatMonitor(new Connection(config.solanaRpcUrl, "finalized"), market).then((result) => result.ok
        ? { capability: "finalized_read" as const, report: result.value }
        : { capability: "unavailable" as const, report: null, reason: result.code });

    return context.json({
      ok: true,
      source: "captured_snapshot",
      market,
      campaign,
      evidence: {
        stockCheck: stockCheck.ok ? {
          capability: "fixture_backed",
          report: stockCheck.value,
          reportHash: hashEvidence(stockCheck.value),
        } : {
          capability: "unavailable",
          report: null,
          reportHash: null,
          reason: stockCheck.code,
        },
        feasibility: feasibility === null ? null : {
          capability: "fixture_backed",
          report: feasibility,
          reportHash: hashEvidence(feasibility),
        },
        underwriting: underwriting.ok ? {
          capability: "preview_only",
          report: underwriting.value,
        } : {
          capability: "unavailable",
          report: null,
          reason: underwriting.code,
        },
        floatMonitor,
      },
    });
  });

  app.get("/api/markets/:id/stock-check", async (context) => {
    const marketId = context.req.param("id");
    if (findMarketFixture(marketId) === undefined) return context.json(apiError("MARKET_NOT_FOUND", "This market is not in the supported registry."), 404);
    const startedAt = Date.now();
    const correlationId = context.req.header("x-correlation-id")?.trim().slice(0, 128) || crypto.randomUUID();
    const cached = await evidenceStore.latest<StockCheckReport>("stock_check", marketId);
    if (cached !== null) {
      console.info(JSON.stringify({ event: "evidence_read", correlationId, source: cached.source, subjectId: marketId, latencyMs: Date.now() - startedAt, result: "cache_hit", freshness: cached.freshness }));
      return context.json({ ok: true, capability: "fixture_backed", stockCheck: cached.payload, evidence: { reportHash: cached.reportHash, freshness: cached.freshness, observedAt: cached.observedAt } });
    }
    const result = await reconcileInitialStockCheck(evidenceStore, marketId);
    if (!result.ok) return context.json(result, 503);
    console.info(JSON.stringify({ event: "evidence_read", correlationId, source: "fixture:initial-stock-check-v1", subjectId: marketId, latencyMs: Date.now() - startedAt, result: "cache_seeded", reportHash: result.value.reportHash }));
    return context.json({ ok: true, capability: "fixture_backed", stockCheck: result.value.snapshot.payload, evidence: { reportHash: result.value.reportHash, freshness: "fresh", observedAt: result.value.snapshot.observedAt } });
  });

  app.get("/api/markets/:id/feasibility", (context) => {
    const marketId = context.req.param("id");
    if (marketId !== "nvdge-nvdax") return context.json(apiError("MARKET_NOT_FOUND", "This market is not in the supported feasibility registry."), 404);
    return context.json({ ok: true, capability: "fixture_backed", report: buildPhase00Report() });
  });

  app.get("/api/markets/:id/underwriting", (context) => {
    const marketId = context.req.param("id");
    if (findMarketFixture(marketId) === undefined) return context.json(apiError("MARKET_NOT_FOUND", "This market is not in the supported registry."), 404);
    const result = buildUnderwritingFixture(marketId);
    if (!result.ok) return context.json(result, 503);
    return context.json({ ok: true, capability: "preview_only", underwriting: result.value });
  });

  app.get("/api/markets/:id/quote", async (context) => {
    const market = marketById(context.req.param("id"));
    if (market === undefined) return context.json(apiError("QUOTE_MARKET_UNSUPPORTED", "A finalized sized quote is not available for this market yet."), 503);
    const parsed = SizedQuoteQuerySchema.safeParse(context.req.query());
    if (!parsed.success) return context.json(apiError("INVALID_SIZED_QUOTE", "Quote input must include a positive raw amount, supported input mint, and valid slippage."), 400);
    if (config.solanaRpcUrl === null) return context.json(apiError("QUOTE_READ_UNAVAILABLE", "A finalized Solana RPC is not configured for sized quotes."), 503);
    const result = await readCandidateSizedQuote(new Connection(config.solanaRpcUrl, "finalized"), { ...parsed.data, marketId: market.id, poolId: market.pool });
    if (!result.ok) return context.json(result, 503);
    return context.json({ ok: true, capability: "finalized_read", quote: result.value });
  });

  app.get("/api/markets/:id/float-monitor", async (context) => {
    const market = marketById(context.req.param("id"));
    if (market === undefined) return context.json(apiError("MARKET_NOT_FOUND", "This market is not in the supported registry."), 404);
    if (config.solanaRpcUrl === null) return context.json(apiError("FLOAT_MONITOR_READ_UNAVAILABLE", "A finalized Solana RPC is not configured for the stock monitor."), 503);
    const result = await readFloatMonitor(new Connection(config.solanaRpcUrl, "finalized"), market);
    if (!result.ok) return context.json(result, 503);
    return context.json({ ok: true, capability: "finalized_read", monitor: result.value });
  });

  app.get("/api/campaigns", (context) => context.json({
    ok: true,
    source: "captured_snapshot",
    campaigns: buildCampaignFeed(listCampaignFixtures()),
  }));

  app.get("/api/campaigns/:id", (context) => {
    const campaign = findCampaignFixture(context.req.param("id"));
    if (campaign === undefined) return context.json(apiError("CAMPAIGN_NOT_FOUND", "This campaign is not in the preview catalog."), 404);
    return context.json({ ok: true, source: "captured_snapshot", campaign });
  });

  app.get("/api/campaigns/:id/underwriting", (context) => {
    const campaign = findCampaignFixture(context.req.param("id"));
    if (campaign === undefined) return context.json(apiError("CAMPAIGN_NOT_FOUND", "This campaign is not in the preview catalog."), 404);
    const result = buildUnderwritingFixture(campaign.marketId);
    if (!result.ok) return context.json(result, 503);
    return context.json({ ok: true, capability: "preview_only", underwriting: result.value });
  });

  app.post("/api/campaigns", (context) => context.json(apiError("CAMPAIGN_CREATION_UNAVAILABLE", "Campaign creation is not available in preview mode."), 503));
  app.post("/api/campaigns/:id/back", (context) => context.json(apiError("CAMPAIGN_BACKING_UNAVAILABLE", "Campaign backing is not available until the user-owned funding path is approved."), 503));
  app.post("/api/position-intents/review", async (context) => {
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json(apiError("INVALID_POSITION_REVIEW", "Position review input must be valid JSON."), 400);
    }
    const parsed = PositionReviewSchema.safeParse(body);
    if (!parsed.success) return context.json(apiError("INVALID_POSITION_REVIEW", "Position review input is incomplete or malformed."), 400);
    const phase00 = buildPhase00Report();
    const result = reviewPositionIntent({
      ...parsed.data,
      phase00Status: phase00.status,
      phase00ReportHash: hashEvidence(phase00),
      phase00ObservedAt: phase00.checkedAt,
      quoteStatus: "incomplete",
      quoteReportHash: null,
      quoteObservedAt: null,
    });
    if (!result.ok) return context.json(result, 400);
    return context.json({ ok: true, capability: "preview_only", review: result.value });
  });
  app.post("/api/position-intents", (context) => context.json(apiError("TRANSACTION_PREPARATION_UNAVAILABLE", "LP transaction preparation is not available."), 503));

  app.notFound((context) => context.json(apiError("NOT_FOUND", "This FLOAT API route does not exist."), 404));
  app.onError((error, context) => {
    console.error(JSON.stringify({ event: "backend_request_failed", message: error.message, path: context.req.path }));
    return context.json(apiError("INTERNAL_ERROR", "FLOAT could not complete this request."), 500);
  });

  return app;
}

import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { requestId } from "hono/request-id";
import { Hono } from "hono";
import { buildInitialStockCheck, buildUnderwritingFixture, buildUnderwritingFromStockCheck, findCampaignFixture, findMarketFixture, listCampaignFixtures, listMarketFixtures } from "./fixtures";
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
import { readFinalizedStockCheck } from "../adapters/solana-stock-check-read";
import { readFinalizedRewardEvidence } from "../adapters/solana-reward-read";
import { hashEvidence } from "./evidence";
import { z } from "zod";
import { marketById } from "../domain/market-catalog";
import { createGameRouter } from "./game/routes";
import type { GameRouterRuntime } from "./game/routes";

interface ApiError {
  ok: false;
  code: string;
  message: string;
  retryable: boolean;
}

export interface BackendOperationalProbe {
  isDraining(): boolean;
  checkDependencies(): Promise<{
    database: "ready" | "unavailable";
    migrations: "ready" | "incomplete" | "unavailable";
    readyToAdmit: boolean;
    readyToRecover: boolean;
    reasons: readonly string[];
  }>;
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

export function createBackendApp(
  config: BackendConfig,
  evidenceStore: EvidenceStore = createEvidenceStore(config.databaseUrl),
  gameRuntime?: GameRouterRuntime,
  operationalProbe?: BackendOperationalProbe,
): Hono {
  const app = new Hono();

  app.use("*", requestId());
  app.use("*", secureHeaders());
  app.use("*", cors({
    origin: config.allowedOrigins.length > 0 ? [...config.allowedOrigins] : "http://localhost:3000",
    allowHeaders: ["Authorization", "Content-Type", "Last-Event-ID", "X-Correlation-ID", "Idempotency-Key"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    exposeHeaders: ["X-Request-ID"],
    maxAge: 600,
    credentials: false,
  }));
  app.use("/api/*", bodyLimit({ maxSize: 32 * 1024, onError: (context) => context.json(apiError("REQUEST_BODY_TOO_LARGE", "Request body exceeds the 32 KiB limit."), 413) }));
  app.route("/", createGameRouter(gameRuntime));

  app.get("/api/live", (context) => context.json({
    product: "KOVA",
    status: "alive",
    serverTime: new Date().toISOString(),
  }));

  app.get("/api/ready", async (context) => {
    if (!operationalProbe) {
      return context.json({
        product: "KOVA",
        status: "ready_preview",
        readyToServe: true,
        readyToAdmit: false,
        readyToRecover: false,
        dependencies: { database: "preview_memory", migrations: "not_required" },
        reasons: ["DURABLE_GAME_DISABLED"],
        serverTime: new Date().toISOString(),
      });
    }
    if (operationalProbe.isDraining()) {
      return context.json({
        product: "KOVA",
        status: "draining",
        readyToServe: false,
        readyToAdmit: false,
        readyToRecover: false,
        dependencies: { database: "unknown", migrations: "unknown" },
        reasons: ["SERVER_DRAINING"],
        serverTime: new Date().toISOString(),
      }, 503);
    }
    try {
      const result = await operationalProbe.checkDependencies();
      const readyToServe = result.database === "ready" && result.migrations === "ready";
      return context.json({
        product: "KOVA",
        status: readyToServe ? "ready" : "not_ready",
        readyToServe,
        readyToAdmit: readyToServe && result.readyToAdmit,
        readyToRecover: readyToServe && result.readyToRecover,
        dependencies: { database: result.database, migrations: result.migrations },
        reasons: result.reasons,
        serverTime: new Date().toISOString(),
      }, readyToServe ? 200 : 503);
    } catch {
      return context.json({
        product: "KOVA",
        status: "not_ready",
        readyToServe: false,
        readyToAdmit: false,
        readyToRecover: false,
        dependencies: { database: "unavailable", migrations: "unavailable" },
        reasons: ["DEPENDENCY_CHECK_FAILED"],
        serverTime: new Date().toISOString(),
      }, 503);
    }
  });

  app.get("/api/health", (context) => context.json({
    product: "KOVA",
    mode: config.mode,
    status: "ok",
    capabilities: {
      database: config.databaseUrl === null ? "preview_memory" : "configured_not_verified",
      finalizedRpc: config.solanaRpcUrl === null ? "fixture" : "configured_not_verified",
      marketReads: "captured_snapshot",
      stockCheck: config.solanaRpcUrl === null ? "fixture_backed" : "finalized_read_available",
      stockFloatMonitor: config.solanaRpcUrl === null ? "unavailable" : "finalized_read_available",
      rewardEvidence: config.solanaRpcUrl === null ? "unavailable" : "finalized_read_available",
      campaigns: "captured_snapshot",
      underwriting: "preview_only",
      walletConnection: "browser_seam_only",
      paidResearch: "unavailable",
      walletSigning: "unavailable",
      transactionPreparation: "unavailable",
      automatedRebalancing: "unavailable",
      gameRules: gameRuntime ? "live" : "preview_only",
      gameCommitments: gameRuntime ? "live" : "preview_only",
      dealerAdmission: "blocked",
      privatePickStorage: gameRuntime ? "live" : "unavailable",
      ansemEscrow: "unavailable",
      gameSettlement: "unavailable",
      payoutExecution: "unavailable",
    },
  }));

  app.get("/api/capabilities", (context) => context.json({
    product: "KOVA",
    stage: gameRuntime ? "m3_private_admission" : "m2_local_program",
    mode: config.mode,
    capabilities: {
      phase00Feasibility: "blocked",
      marketReads: "captured_snapshot",
      stockCheck: config.solanaRpcUrl === null ? "fixture_backed" : "finalized_read_available",
      stockFloatMonitor: config.solanaRpcUrl === null ? "unavailable" : "finalized_read_available",
      rewardEvidence: config.solanaRpcUrl === null ? "unavailable" : "finalized_read_available",
      campaigns: "captured_snapshot",
      underwriting: "preview_only",
      walletConnection: "browser_seam_only",
      positionIntentReview: "preview_only",
      paidResearch: "unavailable",
      transactionPreparation: "unavailable",
      walletSigning: "unavailable",
      automatedRebalancing: "unavailable",
      gameRules: gameRuntime ? "live" : "preview_only",
      gameCommitments: gameRuntime ? "live" : "preview_only",
      dealerAdmission: "blocked",
      privatePickStorage: gameRuntime ? "live" : "unavailable",
      ansemEscrow: "unavailable",
      gameSettlement: "unavailable",
      payoutExecution: "unavailable",
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
    const stockCheck = config.solanaRpcUrl === null
      ? buildInitialStockCheck(market.id)
      : await readFinalizedStockCheck(new Connection(config.solanaRpcUrl, "finalized"), market);
    const underwriting = stockCheck.ok
      ? buildUnderwritingFromStockCheck(market.id, stockCheck.value)
      : { ok: false as const, code: "UNDERWRITING_UNAVAILABLE", message: "Underwriting is unavailable because the finalized stock check could not be read.", retryable: true as const };
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
    const rewards = config.solanaRpcUrl === null
      ? { capability: "unavailable" as const, report: null, reason: "REWARD_READ_UNAVAILABLE" }
      : await readFinalizedRewardEvidence(new Connection(config.solanaRpcUrl, "finalized"), market).then((result) => result.ok
        ? { capability: "finalized_read" as const, report: result.value }
        : { capability: "unavailable" as const, report: null, reason: result.code });

    return context.json({
      ok: true,
      source: "captured_snapshot",
      market,
      campaign,
      evidence: {
        stockCheck: stockCheck.ok ? {
          capability: config.solanaRpcUrl === null ? "fixture_backed" : "finalized_read",
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
        rewards,
      },
    });
  });

  app.get("/api/markets/:id/stock-check", async (context) => {
    const marketId = context.req.param("id");
    const market = marketById(marketId);
    if (market === undefined) return context.json(apiError("MARKET_NOT_FOUND", "This market is not in the supported registry."), 404);
    const startedAt = Date.now();
    const correlationId = context.req.header("x-correlation-id")?.trim().slice(0, 128) || crypto.randomUUID();
    if (config.solanaRpcUrl !== null) {
      const result = await readFinalizedStockCheck(new Connection(config.solanaRpcUrl, "finalized"), market);
      if (!result.ok) {
        console.info(JSON.stringify({ event: "evidence_read", correlationId, source: "solana_rpc", subjectId: marketId, latencyMs: Date.now() - startedAt, result: "unavailable", reason: result.code }));
        return context.json(result, 503);
      }
      const reportHash = hashEvidence(result.value);
      console.info(JSON.stringify({ event: "evidence_read", correlationId, source: "solana_rpc", subjectId: marketId, latencyMs: Date.now() - startedAt, result: "finalized_read", reportHash }));
      return context.json({ ok: true, capability: "finalized_read", stockCheck: result.value, evidence: { reportHash, freshness: "fresh", observedAt: result.value.checkedAt } });
    }
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

  app.get("/api/markets/:id/rewards", async (context) => {
    const market = marketById(context.req.param("id"));
    if (market === undefined) return context.json(apiError("MARKET_NOT_FOUND", "This market is not in the supported registry."), 404);
    if (config.solanaRpcUrl === null) return context.json(apiError("REWARD_READ_UNAVAILABLE", "A finalized Solana RPC is not configured for reward evidence."), 503);
    const result = await readFinalizedRewardEvidence(new Connection(config.solanaRpcUrl, "finalized"), market);
    if (!result.ok) return context.json(result, 503);
    return context.json({ ok: true, capability: "finalized_read", rewards: result.value, evidence: { reportHash: hashEvidence(result.value), observedAt: result.value.observedAt } });
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

  app.notFound((context) => context.json(apiError("NOT_FOUND", "This KOVA API route does not exist."), 404));
  app.onError((error, context) => {
    console.error(JSON.stringify({ event: "backend_request_failed", message: error.message, path: context.req.path }));
    return context.json(apiError("INTERNAL_ERROR", "KOVA could not complete this request."), 500);
  });

  return app;
}

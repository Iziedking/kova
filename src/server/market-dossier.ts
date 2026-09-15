import { CAMPAIGN_CATALOG } from "../domain/campaign-catalog";
import { marketById } from "../domain/market-catalog";
import { z } from "zod";

const MarketSchema = z.object({
  id: z.string(),
  pair: z.string(),
  community: z.string(),
  stockSymbol: z.string(),
  stockMint: z.string(),
  stockProgramId: z.string(),
  stockDecimals: z.number().int(),
  memeSymbol: z.string(),
  memeMint: z.string(),
  memeProgramId: z.string(),
  memeDecimals: z.number().int(),
  pool: z.string(),
  raydiumProgram: z.string(),
  tvlUsdMicro: z.string().nullable(),
  volume24hUsdMicro: z.string().nullable(),
  capability: z.enum(["fixture", "live_read", "chain_confirmed", "unavailable"]),
  status: z.enum(["captured_snapshot", "needs_review"]),
  riskLabel: z.enum(["Review required", "Thin exit depth", "Token-2022 review"]),
  snapshotAt: z.string(),
});

const CampaignSchema = z.object({
  id: z.string(),
  marketId: z.string(),
  targetUsdMicro: z.string(),
  backedUsdMicro: z.string(),
  rewardMint: z.string(),
  rewardBudgetRaw: z.string(),
  endsAt: z.string(),
  status: z.enum(["seeking_interest", "ready_to_fund", "under_target"]),
  agentRating: z.enum(["Healthy", "Review required"]),
  feeSnapshotUsdMicro: z.string().nullable(),
});

const MarketDossierResponseSchema = z.object({
  ok: z.literal(true),
  source: z.literal("captured_snapshot"),
  market: MarketSchema,
  campaign: CampaignSchema.nullable(),
  evidence: z.object({
    stockCheck: z.unknown(),
    feasibility: z.unknown().nullable(),
    underwriting: z.unknown(),
    floatMonitor: z.unknown(),
  }).passthrough(),
});

export type MarketDossier = z.infer<typeof MarketDossierResponseSchema>;

export type MarketDossierResult =
  | { ok: true; source: "local_preview" | "vm_backend"; dossier: MarketDossier }
  | { ok: false; code: "MARKET_NOT_FOUND" | "BACKEND_CONFIGURATION_INVALID" | "BACKEND_UNAVAILABLE"; message: string };

interface LoadMarketDossierOptions {
  backendUrl?: string;
  fetcher?: typeof fetch;
}

function localDossier(id: string): MarketDossier | null {
  const market = marketById(id);
  if (market === undefined) return null;
  const campaign = CAMPAIGN_CATALOG.find((candidate) => candidate.marketId === id);
  return {
    ok: true,
    source: "captured_snapshot",
    market,
    campaign: campaign ?? null,
    evidence: {
      stockCheck: null,
      feasibility: null,
      underwriting: null,
      floatMonitor: null,
    },
  };
}

function backendOrigin(value: string): URL | null {
  try {
    const url = new URL(value);
    const localDevelopment = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(localDevelopment && url.protocol === "http:")) return null;
    url.pathname = url.pathname.replace(/\/$/, "");
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

export async function loadMarketDossier(id: string, options: LoadMarketDossierOptions = {}): Promise<MarketDossierResult> {
  const local = localDossier(id);
  if (local === null) return { ok: false, code: "MARKET_NOT_FOUND", message: "This market is not in the supported registry." };

  const configuredBackendUrl = options.backendUrl === undefined ? process.env.FLOAT_BACKEND_API_URL?.trim() ?? "" : options.backendUrl.trim();
  if (configuredBackendUrl.length === 0) return { ok: true, source: "local_preview", dossier: local };

  const origin = backendOrigin(configuredBackendUrl);
  if (origin === null) return { ok: false, code: "BACKEND_CONFIGURATION_INVALID", message: "The configured FLOAT backend URL must be HTTPS, except for local development." };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const dossierUrl = new URL(`/api/markets/${encodeURIComponent(id)}`, origin).toString();
    const response = await (options.fetcher ?? fetch)(dossierUrl, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (response.status === 404) return { ok: false, code: "MARKET_NOT_FOUND", message: "This market is not in the backend registry." };
    if (!response.ok) return { ok: false, code: "BACKEND_UNAVAILABLE", message: "The FLOAT backend could not provide this market dossier." };
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false, code: "BACKEND_UNAVAILABLE", message: "The FLOAT backend returned an unreadable market dossier." };
    }
    const parsed = MarketDossierResponseSchema.safeParse(body);
    if (!parsed.success) return { ok: false, code: "BACKEND_UNAVAILABLE", message: "The FLOAT backend returned an invalid market dossier." };
    return { ok: true, source: "vm_backend", dossier: parsed.data };
  } catch {
    return { ok: false, code: "BACKEND_UNAVAILABLE", message: "The FLOAT backend is unavailable. No local data was substituted." };
  } finally {
    clearTimeout(timeout);
  }
}

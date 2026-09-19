/**
 * Source: DEX Screener API reference and observed public payloads.
 * Version: public API as read on 2026-09-19.
 * Docs: https://docs.dexscreener.com/api/reference
 *
 * Read-only M0 evidence recipe. It never connects a wallet, asks for a quote,
 * signs, or sends a transaction. Raw public payloads go under ignored artifacts.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PublicKey } from "@solana/web3.js";
import { z } from "zod";

const tokenSchema = z.object({
  address: z.string().min(1).max(128),
  name: z.string(),
  symbol: z.string(),
});

const pairSchema = z.object({
  chainId: z.string(),
  dexId: z.string(),
  pairAddress: z.string().min(1).max(128),
  baseToken: tokenSchema,
  quoteToken: tokenSchema.partial().extend({ address: z.string().nullable().optional() }),
  priceUsd: z.string().nullable().optional(),
  liquidity: z.object({ usd: z.number().nullable().optional() }).passthrough().nullable().optional(),
  pairCreatedAt: z.number().int().nullable().optional(),
  txns: z.record(z.string(), z.object({ buys: z.number().int(), sells: z.number().int() })).optional(),
}).passthrough();

const searchSchema = z.object({ pairs: z.array(pairSchema).nullable() }).passthrough();
const tokenPairsSchema = z.array(pairSchema);
const SEARCH_TERMS = [
  "GME", "AMC", "NVDA", "TSLA", "HOOD", "COIN", "MSTR", "SPY", "Wall Street", "STONK",
  "GameStop", "Roaring Kitty", "WallStreetBets", "Nvidia", "Tesla", "Robinhood", "Coinbase", "Apple", "Microsoft", "Amazon",
] as const;
const API_ORIGIN = "https://api.dexscreener.com";
const SAMPLES_PER_CANDIDATE = 3;

type Pair = z.infer<typeof pairSchema>;
type Candidate = { query: string; mint: string; discoveryPair: string; symbol: string; name: string };

function liquidityUsd(pair: Pair): number {
  return pair.liquidity?.usd ?? 0;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isSolanaPublicKey(value: string): boolean {
  try {
    return new PublicKey(value).toBytes().length === 32;
  } catch {
    return false;
  }
}

function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil((sorted.length - 1) * fraction)] ?? null;
}

async function timedJson(url: string): Promise<{ body: unknown; latencyMs: number; capturedAt: string; raw: string }> {
  const startedAt = performance.now();
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  const raw = await response.text();
  const latencyMs = Math.round((performance.now() - startedAt) * 100) / 100;
  if (!response.ok) throw new Error(`DEX Screener returned HTTP ${response.status}.`);
  return { body: JSON.parse(raw) as unknown, latencyMs, capturedAt: new Date().toISOString(), raw };
}

async function discoverCandidates(): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  for (const query of SEARCH_TERMS) {
    if (candidates.length === 10) break;
    const result = await timedJson(`${API_ORIGIN}/latest/dex/search?q=${encodeURIComponent(query)}`);
    const parsed = searchSchema.parse(result.body);
    const pair = (parsed.pairs ?? [])
      .filter((item) => item.chainId === "solana"
        && isSolanaPublicKey(item.baseToken.address)
        && isSolanaPublicKey(item.pairAddress)
        && !seen.has(item.baseToken.address))
      .sort((left, right) => liquidityUsd(right) - liquidityUsd(left))[0];
    if (pair === undefined) continue;
    seen.add(pair.baseToken.address);
    candidates.push({ query, mint: pair.baseToken.address, discoveryPair: pair.pairAddress, symbol: pair.baseToken.symbol, name: pair.baseToken.name });
  }
  return candidates;
}

async function main(): Promise<void> {
  const candidates = await discoverCandidates();
  if (candidates.length < 10) throw new Error(`Expected 10 distinct Solana candidates, discovered ${candidates.length}.`);

  const artifactId = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const artifactDirectory = resolve(process.cwd(), "artifacts", "m0-pricing", artifactId);
  await mkdir(artifactDirectory, { recursive: true });
  const observations: object[] = [];
  const allLatencies: number[] = [];

  for (const candidate of candidates) {
    for (let attempt = 1; attempt <= SAMPLES_PER_CANDIDATE; attempt += 1) {
      const result = await timedJson(`${API_ORIGIN}/token-pairs/v1/solana/${candidate.mint}`);
      const pairs = tokenPairsSchema.parse(result.body);
      const canonical = pairs
        .filter((pair) => pair.chainId === "solana"
          && pair.baseToken.address === candidate.mint
          && isSolanaPublicKey(pair.pairAddress))
        .sort((left, right) => {
          const liquidityDifference = liquidityUsd(right) - liquidityUsd(left);
          return liquidityDifference === 0 ? left.pairAddress.localeCompare(right.pairAddress) : liquidityDifference;
        })[0];
      const rawHash = sha256(result.raw);
      await writeFile(resolve(artifactDirectory, `${candidate.query.replaceAll(" ", "-")}-${attempt}-${rawHash.slice(0, 12)}.json`), result.raw, "utf8");
      allLatencies.push(result.latencyMs);
      observations.push({
        ...candidate,
        attempt,
        capturedAt: result.capturedAt,
        latencyMs: result.latencyMs,
        rawHash,
        returnedPairCount: pairs.length,
        canonicalPair: canonical?.pairAddress ?? null,
        dexId: canonical?.dexId ?? null,
        priceUsd: canonical?.priceUsd ?? null,
        reportedLiquidityUsd: canonical?.liquidity?.usd ?? null,
        pairCreatedAt: canonical?.pairCreatedAt ?? null,
        providerPriceObservedAt: null,
        providerSlot: null,
      });
    }
  }

  const summary = {
    schemaVersion: "kova-m0-pricing-v1",
    source: `${API_ORIGIN}/token-pairs/v1/solana/{mint}`,
    generatedAt: new Date().toISOString(),
    candidateCount: candidates.length,
    samplesPerCandidate: SAMPLES_PER_CANDIDATE,
    sampleCount: allLatencies.length,
    latencyMs: {
      min: Math.min(...allLatencies),
      p50: percentile(allLatencies, 0.5),
      p95: percentile(allLatencies, 0.95),
      max: Math.max(...allLatencies),
    },
    providerPriceTimestampCoverage: 0,
    providerSlotCoverage: 0,
    conclusion: "Current marks were observed, but exact source observation time and slot are unavailable in this payload.",
    candidates,
    observations,
  };
  const summaryPath = resolve(artifactDirectory, "summary.json");
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, artifactDirectory, ...summary, observations: undefined }, null, 2));
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ ok: false, code: "M0_PRICING_PROBE_FAILED", message: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});

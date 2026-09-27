/**
 * DEX Screener pair mark capture for KOVA rounds.
 * Endpoint: GET https://api.dexscreener.com/latest/dex/pairs/solana/{pairAddress}
 * (docs.dexscreener.com/api/reference, read 2026-09-19).
 *
 * The response carries no source timestamp or slot, so KOVA records its own request
 * window and the raw body hash. This is the "observed mark" trust model the release
 * notes disclose; it is not a manipulation-resistant oracle.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { decimalToPrice18 } from "../../domain/game/amounts";

const PairResponseSchema = z.object({
  pairs: z.array(z.object({
    chainId: z.string(),
    pairAddress: z.string(),
    baseToken: z.object({ address: z.string() }),
    priceUsd: z.string().nullable().optional(),
    liquidity: z.object({ usd: z.number().nullable().optional() }).passthrough().nullable().optional(),
  }).passthrough()).nullable(),
}).passthrough();

export interface PairMark {
  pairAddress: string;
  mint: string;
  price18: string;
  liquidityUsd: number | null;
  rawResponseHash: string;
  requestStartedAt: string;
  requestFinishedAt: string;
}

/** Plain decimal only. DEX Screener sometimes returns more than 18 places; truncate toward zero. */
export function priceUsdToPrice18(value: string): string {
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.exec(value.trim());
  if (!match) throw new Error("PRICE_NOT_DECIMAL");
  const fraction = (match[2] ?? "").slice(0, 18);
  const price18 = decimalToPrice18(fraction ? `${match[1]}.${fraction}` : match[1]!);
  if (BigInt(price18) <= 0n) throw new Error("PRICE_NOT_POSITIVE");
  return price18;
}

export async function capturePairMark(input: { pairAddress: string; mint: string; fetcher?: typeof fetch; timeoutMs?: number }): Promise<PairMark> {
  const requestStartedAt = new Date().toISOString();
  const response = await (input.fetcher ?? fetch)(`https://api.dexscreener.com/latest/dex/pairs/solana/${encodeURIComponent(input.pairAddress)}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(input.timeoutMs ?? 10_000),
  });
  const body = await response.text();
  const requestFinishedAt = new Date().toISOString();
  if (!response.ok) throw new Error(`PRICE_HTTP_${response.status}`);
  const parsed = PairResponseSchema.safeParse(JSON.parse(body));
  if (!parsed.success) throw new Error("PRICE_PAYLOAD_INVALID");
  const pair = parsed.data.pairs?.find((candidate) => candidate.chainId === "solana" && candidate.pairAddress === input.pairAddress);
  if (!pair) throw new Error("PRICE_PAIR_MISSING");
  // The committed pick binds mint and pair together; a pair quoting a different base token is not this pick.
  if (pair.baseToken.address !== input.mint) throw new Error("PRICE_PAIR_MINT_MISMATCH");
  if (!pair.priceUsd) throw new Error("PRICE_UNAVAILABLE");
  return {
    pairAddress: input.pairAddress,
    mint: input.mint,
    price18: priceUsdToPrice18(pair.priceUsd),
    liquidityUsd: pair.liquidity?.usd ?? null,
    rawResponseHash: createHash("sha256").update(body).digest("hex"),
    requestStartedAt,
    requestFinishedAt,
  };
}

/**
 * Prices for NEAR memecoins, read from DEX Screener with GeckoTerminal as a fallback.
 *
 *   GET https://api.dexscreener.com/token-pairs/v1/near/{token}     deepest NEAR pair wins
 *   GET https://api.geckoterminal.com/api/v2/networks/near/tokens/{token}
 *
 * Both were checked against live responses on 2026-11-12 (DEX Screener chainId "near", dexId
 * "rhea-finance"; GeckoTerminal network "near"). These are mainnet prices used to score a game
 * played with a testnet token.
 */
import { z } from "zod";

export type NearMarket = { id: string; token: string; symbol: string; name: string };

/**
 * Picks are limited to NEAR memecoins with a real pool. Liquidity is checked again at every
 * price read; a pool below the floor is refused rather than scored.
 */
export const NEAR_MEME_MARKETS: readonly NearMarket[] = [
  { id: "near:blackdragon.tkn.near", token: "blackdragon.tkn.near", symbol: "BLACKDRAGON", name: "Black Dragon" },
  { id: "near:token.0xshitzu.near", token: "token.0xshitzu.near", symbol: "SHITZU", name: "Shitzu" },
  { id: "near:jambo-1679.meme-cooking.near", token: "jambo-1679.meme-cooking.near", symbol: "JAMBO", name: "Jambo" },
  { id: "near:purge-558.meme-cooking.near", token: "purge-558.meme-cooking.near", symbol: "PURGE", name: "Purge" },
  { id: "near:gear.enleap.near", token: "gear.enleap.near", symbol: "GEAR", name: "Gear" },
  { id: "near:token.lonkingnearbackto2024.near", token: "token.lonkingnearbackto2024.near", symbol: "LONK", name: "Lonk" },
  { id: "near:ftv2.nekotoken.near", token: "ftv2.nekotoken.near", symbol: "NEKO", name: "Neko" },
];

export const MIN_LIQUIDITY_USD = 10_000;

export type NearPrice = {
  market: string;
  priceE18: bigint;
  priceUsd: string;
  liquidityUsd: number;
  change1hPct: number | null;
  source: "dexscreener" | "geckoterminal";
  sourceRef: string;
  capturedAt: Date;
};

export function marketById(id: string): NearMarket | undefined {
  return NEAR_MEME_MARKETS.find((m) => m.id === id);
}

/** Exact decimal string to an integer with 18 decimals. Accepts "0.000000006416" and "1.2e-8". */
export function decimalToE18(value: string): bigint {
  const trimmed = value.trim();
  if (/e/i.test(trimmed)) {
    const [mantissa, exponentText] = trimmed.toLowerCase().split("e");
    const exponent = Number(exponentText);
    const [whole, fraction = ""] = mantissa.split(".");
    const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "");
    const shift = 18 + exponent - fraction.length;
    if (!/^\d+$/.test(digits) || !Number.isInteger(exponent)) throw new Error(`Bad price ${value}`);
    return shift >= 0 ? BigInt(digits) * 10n ** BigInt(shift) : BigInt(digits) / 10n ** BigInt(-shift);
  }
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error(`Bad price ${value}`);
  const [whole, fraction = ""] = trimmed.split(".");
  return BigInt(whole) * 10n ** 18n + BigInt((fraction + "0".repeat(18)).slice(0, 18));
}

const dexPairs = z.array(
  z.object({
    chainId: z.string(),
    pairAddress: z.string(),
    baseToken: z.object({ address: z.string() }),
    priceUsd: z.string().optional(),
    liquidity: z.object({ usd: z.number().optional() }).optional(),
    priceChange: z.object({ h1: z.number().optional() }).optional(),
  }),
);

const geckoToken = z.object({
  data: z.object({ attributes: z.object({ price_usd: z.string().nullable(), total_reserve_in_usd: z.string().nullable().optional() }) }),
});

type Fetcher = typeof fetch;

export class NearPriceFeed {
  constructor(private readonly fetcher: Fetcher = fetch) {}

  private async dexscreener(market: NearMarket): Promise<NearPrice> {
    const response = await this.fetcher(`https://api.dexscreener.com/token-pairs/v1/near/${encodeURIComponent(market.token)}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`DEX Screener ${response.status}`);
    const pairs = dexPairs
      .parse(await response.json())
      .filter((p) => p.chainId === "near" && p.baseToken.address === market.token && p.priceUsd)
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    const pair = pairs[0];
    if (!pair?.priceUsd) throw new Error(`No NEAR pair for ${market.symbol}`);
    const liquidityUsd = pair.liquidity?.usd ?? 0;
    if (liquidityUsd < MIN_LIQUIDITY_USD) throw new Error(`${market.symbol} liquidity $${Math.round(liquidityUsd)} is below $${MIN_LIQUIDITY_USD}`);
    return {
      market: market.id,
      priceE18: decimalToE18(pair.priceUsd),
      priceUsd: pair.priceUsd,
      liquidityUsd,
      change1hPct: pair.priceChange?.h1 ?? null,
      source: "dexscreener",
      sourceRef: `near/${pair.pairAddress}`,
      capturedAt: new Date(),
    };
  }

  private async geckoterminal(market: NearMarket): Promise<NearPrice> {
    const response = await this.fetcher(`https://api.geckoterminal.com/api/v2/networks/near/tokens/${encodeURIComponent(market.token)}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`GeckoTerminal ${response.status}`);
    const attributes = geckoToken.parse(await response.json()).data.attributes;
    if (!attributes.price_usd) throw new Error(`No GeckoTerminal price for ${market.symbol}`);
    const liquidityUsd = Number(attributes.total_reserve_in_usd ?? 0);
    if (liquidityUsd < MIN_LIQUIDITY_USD) throw new Error(`${market.symbol} liquidity is below $${MIN_LIQUIDITY_USD}`);
    return {
      market: market.id,
      priceE18: decimalToE18(attributes.price_usd),
      priceUsd: attributes.price_usd,
      liquidityUsd,
      change1hPct: null,
      source: "geckoterminal",
      sourceRef: `near/tokens/${market.token}`,
      capturedAt: new Date(),
    };
  }

  /** One price for one market. DEX Screener first; GeckoTerminal when it fails. */
  async price(marketId: string): Promise<NearPrice> {
    const market = marketById(marketId);
    if (!market) throw new Error(`Unknown NEAR market ${marketId}`);
    try {
      return await this.dexscreener(market);
    } catch (first) {
      try {
        return await this.geckoterminal(market);
      } catch (second) {
        throw new Error(`${market.symbol}: ${(first as Error).message}; ${(second as Error).message}`);
      }
    }
  }
}

/**
 * Prices for the NEAR markets players pick from, read from DEX Screener.
 *
 *   GET https://api.dexscreener.com/latest/dex/pairs/near/{pairAddress}
 *
 * Every market is pinned to one Rhea (Ref) pool, so a round's start and end prices always come
 * from the same pool. There is no fallback source on purpose: scoring a start price from one
 * source against an end price from another would invent a move. If the pinned pool cannot be
 * read, the step is retried, and a table that cannot be priced in time refunds every stake.
 *
 * Checked against live responses on 2026-11-12 (chainId "near", dexId "rhea-finance"). These are
 * mainnet prices used to score a game played with a testnet token.
 */
import { z } from "zod";

/**
 * "busy" pools trade every few seconds; "launch" coins launched on meme.cooking; "meme" pools are
 * other NEAR memecoins. Launch and meme pools trade a few times an hour.
 */
export type NearMarketGroup = "busy" | "launch" | "meme";

export type NearMarket = {
  id: string;
  token: string;
  symbol: string;
  name: string;
  group: NearMarketGroup;
  /** The auction it launched from on meme.cooking (https://meme.cooking/meme/<id>). */
  memeCookingId?: number;
  /** The one DEX Screener pair this market is scored from. */
  pair: string;
  /** "native" reads priceNative, for a pair quoted in a USD stablecoin (more digits than priceUsd). */
  priceFrom: "usd" | "native";
};

/**
 * Picks are limited to NEAR tokens with a real pool. Liquidity is checked again at every price
 * read; a pool below the floor is refused rather than scored. Each memecoin is pinned to its most
 * active pool above the floor as of 2026-11-12.
 */
export const NEAR_MARKETS: readonly NearMarket[] = [
  { id: "near:wrap.near", token: "wrap.near", symbol: "wNEAR", name: "Wrapped NEAR", group: "busy", pair: "refv2-17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1:wrap.near:100", priceFrom: "native" },
  { id: "near:zec.omft.near", token: "zec.omft.near", symbol: "ZEC", name: "Zcash on NEAR, via NEAR Intents", group: "busy", pair: "refv1-6065", priceFrom: "usd" },
  { id: "near:blackdragon.tkn.near", token: "blackdragon.tkn.near", symbol: "BLACKDRAGON", name: "Black Dragon", group: "meme", pair: "refv1-4276", priceFrom: "usd" },
  { id: "near:token.0xshitzu.near", token: "token.0xshitzu.near", symbol: "SHITZU", name: "Shitzu", group: "meme", pair: "refv1-4369", priceFrom: "usd" },
  // Launched on meme.cooking. On 2026-11-13 these were the only meme.cooking launches (of 267) with
  // a pool above the liquidity floor; none trades every minute, so none joins the busy group.
  { id: "near:jambo-1679.meme-cooking.near", token: "jambo-1679.meme-cooking.near", symbol: "JAMBO", name: "Jambo", group: "launch", memeCookingId: 1679, pair: "refv1-6518", priceFrom: "usd" },
  { id: "near:purge-558.meme-cooking.near", token: "purge-558.meme-cooking.near", symbol: "PURGE", name: "Purge", group: "launch", memeCookingId: 558, pair: "refv1-5650", priceFrom: "usd" },
  { id: "near:gear.enleap.near", token: "gear.enleap.near", symbol: "GEAR", name: "Gear", group: "meme", pair: "refv1-3411", priceFrom: "usd" },
  { id: "near:token.lonkingnearbackto2024.near", token: "token.lonkingnearbackto2024.near", symbol: "LONK", name: "Lonk", group: "meme", pair: "refv1-4314", priceFrom: "usd" },
  { id: "near:ftv2.nekotoken.near", token: "ftv2.nekotoken.near", symbol: "NEKO", name: "Neko", group: "meme", pair: "refv1-3804", priceFrom: "usd" },
];

export const MIN_LIQUIDITY_USD = 10_000;

export type NearPrice = {
  market: string;
  priceE18: bigint;
  /** The decimal price that was scored (USD, or USDC for a "native" market). */
  priceUsd: string;
  liquidityUsd: number;
  change1hPct: number | null;
  /** Swaps in the pinned pool over the last 5 minutes and the last hour, as DEX Screener reports them. */
  trades5m: number;
  trades1h: number;
  /** "meme-cooking" for a "Will it cook?" call, whose value comes from meme.cooking's contract (call-prices.ts). */
  source: "dexscreener" | "meme-cooking";
  sourceRef: string;
  capturedAt: Date;
};

export function marketById(id: string): NearMarket | undefined {
  return NEAR_MARKETS.find((m) => m.id === id);
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

const txCount = z.object({ buys: z.number().optional(), sells: z.number().optional() }).optional();
const tradeCount = (t: z.infer<typeof txCount>) => (t?.buys ?? 0) + (t?.sells ?? 0);

const dexPairResponse = z.object({
  pairs: z
    .array(
      z.object({
        chainId: z.string(),
        pairAddress: z.string(),
        baseToken: z.object({ address: z.string() }),
        priceUsd: z.string().optional(),
        priceNative: z.string().optional(),
        liquidity: z.object({ usd: z.number().optional() }).optional(),
        priceChange: z.object({ h1: z.number().optional() }).optional(),
        txns: z.object({ m5: txCount, h1: txCount }).optional(),
      }),
    )
    .nullable()
    .optional(),
});

type Fetcher = typeof fetch;

export class NearPriceFeed {
  constructor(private readonly fetcher: Fetcher = fetch) {}

  /** One price for one market, from its pinned pool. Throws rather than substitute another source. */
  async price(marketId: string): Promise<NearPrice> {
    const market = marketById(marketId);
    if (!market) throw new Error(`Unknown NEAR market ${marketId}`);
    const response = await this.fetcher(`https://api.dexscreener.com/latest/dex/pairs/near/${encodeURIComponent(market.pair)}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`${market.symbol}: DEX Screener ${response.status}`);
    const pair = (dexPairResponse.parse(await response.json()).pairs ?? []).find((p) => p.chainId === "near" && p.pairAddress === market.pair);
    if (!pair) throw new Error(`${market.symbol}: pool ${market.pair} not found`);
    if (pair.baseToken.address !== market.token) throw new Error(`${market.symbol}: pool ${market.pair} does not price ${market.token}`);
    const value = market.priceFrom === "native" ? pair.priceNative : pair.priceUsd;
    if (!value) throw new Error(`${market.symbol}: no price in pool ${market.pair}`);
    const liquidityUsd = pair.liquidity?.usd ?? 0;
    if (liquidityUsd < MIN_LIQUIDITY_USD) throw new Error(`${market.symbol} liquidity $${Math.round(liquidityUsd)} is below $${MIN_LIQUIDITY_USD}`);
    return {
      market: market.id,
      priceE18: decimalToE18(value),
      priceUsd: value,
      liquidityUsd,
      change1hPct: pair.priceChange?.h1 ?? null,
      trades5m: tradeCount(pair.txns?.m5),
      trades1h: tradeCount(pair.txns?.h1),
      source: "dexscreener",
      sourceRef: `near/${pair.pairAddress}`,
      capturedAt: new Date(),
    };
  }
}

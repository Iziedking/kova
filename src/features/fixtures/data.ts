/**
 * DEVELOPMENT FIXTURES - not production data.
 *
 * Typed against the same contracts as the real services so every screen state
 * can be built and reviewed before the backend supplies it. This module is only
 * bundled when `NEXT_PUBLIC_KOVA_DATA_SOURCE=fixtures`, and the shell shows a
 * "Sample data" banner whenever it is active. Ids are deliberately obvious
 * (`fixture-*`) so a fixture can never be mistaken for a real mint or table.
 */
import type { MarketAsset, PompAsset } from "@/types/market";
import type { HotPlayer, PlayerProfile, RecentShowdown } from "@/types/social";

const RAW = (ansem: number) => (BigInt(ansem) * 1_000_000n).toString();
export const fixtureAnsem = RAW;

/* --- players ------------------------------------------------------------- */

export interface FixturePlayer {
  username: string;
  handle?: string;
  verified?: boolean;
  rating: number;
  matches: number;
  wins: number;
  predictionWinRate: number;
  tradingWinRate: number;
  avgTradingPnlPct: number;
  bestTradingPnlPct: number;
  avgPredictionReturnPct: number;
  streak: number;
  periodPct: number;
  narrative: string;
}

export const FIXTURE_PLAYERS: FixturePlayer[] = [
  { username: "ANSEM", handle: "@blknoi206", verified: true, rating: 2412, matches: 248, wins: 171, predictionWinRate: 66, tradingWinRate: 71, avgTradingPnlPct: 18.4, bestTradingPnlPct: 284.6, avgPredictionReturnPct: 9.2, streak: 6, periodPct: 284.6, narrative: "AI & chips" },
  { username: "kryp2moon", rating: 2288, matches: 205, wins: 132, predictionWinRate: 61, tradingWinRate: 64, avgTradingPnlPct: 12.1, bestTradingPnlPct: 112.3, avgPredictionReturnPct: 7.4, streak: 4, periodPct: 112.3, narrative: "Retail squeezes" },
  { username: "traderanon", rating: 2201, matches: 189, wins: 118, predictionWinRate: 58, tradingWinRate: 63, avgTradingPnlPct: 10.6, bestTradingPnlPct: 98.7, avgPredictionReturnPct: 6.1, streak: 3, periodPct: 98.7, narrative: "AI & chips" },
  { username: "dewildcat", rating: 2143, matches: 176, wins: 104, predictionWinRate: 55, tradingWinRate: 60, avgTradingPnlPct: 9.3, bestTradingPnlPct: 76.4, avgPredictionReturnPct: 5.2, streak: 2, periodPct: 76.4, narrative: "Consumer retail" },
  { username: "memelord", rating: 2090, matches: 231, wins: 128, predictionWinRate: 54, tradingWinRate: 57, avgTradingPnlPct: 8.8, bestTradingPnlPct: 62.1, avgPredictionReturnPct: 4.9, streak: 1, periodPct: 62.1, narrative: "Meme majors" },
  { username: "degenzen", rating: 1988, matches: 144, wins: 76, predictionWinRate: 51, tradingWinRate: 52, avgTradingPnlPct: 5.4, bestTradingPnlPct: 43.8, avgPredictionReturnPct: 3.3, streak: 0, periodPct: 43.8, narrative: "Degen plays" },
  { username: "jaymo", rating: 1902, matches: 98, wins: 49, predictionWinRate: 50, tradingWinRate: 49, avgTradingPnlPct: 3.1, bestTradingPnlPct: 31.2, avgPredictionReturnPct: 2.1, streak: 0, periodPct: 31.2, narrative: "TSLA" },
  { username: "slickrick", rating: 1877, matches: 121, wins: 58, predictionWinRate: 47, tradingWinRate: 49, avgTradingPnlPct: 2.2, bestTradingPnlPct: 27.5, avgPredictionReturnPct: 1.4, streak: 0, periodPct: 27.5, narrative: "GME" },
  { username: "cattrades", rating: 1850, matches: 87, wins: 44, predictionWinRate: 52, tradingWinRate: 48, avgTradingPnlPct: 2.9, bestTradingPnlPct: 24.9, avgPredictionReturnPct: 2.6, streak: 1, periodPct: 24.9, narrative: "AMC" },
  { username: "moonbagz", rating: 1811, matches: 73, wins: 33, predictionWinRate: 44, tradingWinRate: 46, avgTradingPnlPct: 1.1, bestTradingPnlPct: 19.4, avgPredictionReturnPct: 0.8, streak: 0, periodPct: 19.4, narrative: "Meme majors" },
  { username: "KovaPlayer", rating: 1760, matches: 60, wins: 26, predictionWinRate: 43, tradingWinRate: 42, avgTradingPnlPct: -0.6, bestTradingPnlPct: 14.2, avgPredictionReturnPct: -0.4, streak: 0, periodPct: 14.2, narrative: "Index plays" },
  { username: "diamondhands", rating: 1730, matches: 52, wins: 22, predictionWinRate: 41, tradingWinRate: 40, avgTradingPnlPct: -1.2, bestTradingPnlPct: 11.1, avgPredictionReturnPct: -1.0, streak: 0, periodPct: 11.1, narrative: "GME" },
];

export function playerByUsername(username: string): FixturePlayer | undefined {
  return FIXTURE_PLAYERS.find((player) => player.username.toLowerCase() === username.toLowerCase());
}

export function toProfile(player: FixturePlayer): PlayerProfile {
  return {
    id: `fixture-${player.username.toLowerCase()}`,
    username: player.username,
    displayName: player.handle ?? null,
    avatarUrl: null,
    verified: player.verified,
    rating: player.rating,
    stats: {
      matches: player.matches,
      wins: player.wins,
      predictionWinRate: player.predictionWinRate,
      tradingWinRate: player.tradingWinRate,
      avgTradingPnlPct: player.avgTradingPnlPct,
      bestTradingPnlPct: player.bestTradingPnlPct,
      avgPredictionReturnPct: player.avgPredictionReturnPct,
      currentStreak: player.streak,
    },
    favoriteNarrative: player.narrative,
    joinedAt: "2026-03-14T00:00:00.000Z",
  };
}

export function hotPlayers(): HotPlayer[] {
  return FIXTURE_PLAYERS.slice(0, 5).map((player, index) => ({
    rank: index + 1,
    username: player.username,
    handle: player.handle ?? null,
    avatarUrl: null,
    verified: player.verified,
    performancePct: player.periodPct,
    streak: player.streak,
  }));
}

export function recentShowdowns(now: number = Date.now()): RecentShowdown[] {
  const rows: Array<[string, string, string, "prediction" | "trading", number, number]> = [
    ["ANSEM", "KovaPlayer", "Meme Majors", "trading", 200, 6],
    ["traderanon", "jaymo", "TSLA Round 2", "prediction", 50, 22],
    ["memelord", "degenzen", "AI vs Memes", "prediction", 120, 41],
    ["kryp2moon", "slickrick", "GME Showdown", "trading", 75, 68],
    ["cattrades", "moonbagz", "AMC Mania", "trading", 300, 95],
  ];
  return rows.map(([winner, loser, tableName, mode, payout, minutesAgo], index) => ({
    id: `fixture-showdown-${index + 1}`,
    winner,
    loser,
    winnerAvatarUrl: null,
    tableName,
    mode,
    payoutAnsemRaw: RAW(payout),
    settledAt: new Date(now - minutesAgo * 60_000).toISOString(),
  }));
}

/* --- markets ------------------------------------------------------------- */

type SeedAsset = {
  mint: string;
  symbol: string;
  name: string;
  price: number;
  change: number;
  volume: number;
  liquidity: number;
  marketCap: number;
  ageSeconds: number | null;
  category: MarketAsset["category"];
  narrative: string | null;
  underlying: string | null;
  activity: number;
  meme?: boolean;
  trading?: boolean;
};

const SEED_ASSETS: SeedAsset[] = [
  { mint: "fixture-gme", symbol: "GME", name: "GameStop Corp.", price: 28.42, change: 12.4, volume: 42.3e6, liquidity: 9.1e6, marketCap: 8.7e9, ageSeconds: null, category: "meme-stock", narrative: "Consumer Retail", underlying: "GME", activity: 80 },
  { mint: "fixture-amc", symbol: "AMC", name: "AMC Entertainment", price: 4.87, change: -6.2, volume: 18.9e6, liquidity: 4.2e6, marketCap: 1.4e9, ageSeconds: null, category: "meme-stock", narrative: "Entertainment", underlying: "AMC", activity: 74 },
  { mint: "fixture-nvda", symbol: "NVDA", name: "NVIDIA Corp.", price: 875.21, change: 8.7, volume: 61.2e6, liquidity: 22.4e6, marketCap: 2.2e12, ageSeconds: null, category: "meme-stock", narrative: "AI & chips", underlying: "NVDA", activity: 70 },
  { mint: "fixture-tsla", symbol: "TSLA", name: "Tesla, Inc.", price: 248.17, change: -3.1, volume: 55.7e6, liquidity: 18.8e6, marketCap: 790e9, ageSeconds: null, category: "meme-stock", narrative: "EV & autonomy", underlying: "TSLA", activity: 68 },
  { mint: "fixture-spy", symbol: "SPY", name: "SPDR S&P 500 ETF", price: 509.32, change: 1.9, volume: 34.1e6, liquidity: 30.5e6, marketCap: 480e9, ageSeconds: null, category: "index", narrative: "Index", underlying: "SPY", activity: 60 },
  { mint: "fixture-doge", symbol: "DOGE", name: "Dogecoin", price: 0.1623, change: 5.4, volume: 1.4e9, liquidity: 88e6, marketCap: 23e9, ageSeconds: null, category: "other", narrative: "Meme majors", underlying: null, activity: 9 },
  { mint: "fixture-pepe", symbol: "PEPE", name: "Pepe", price: 0.000012, change: 18.7, volume: 610e6, liquidity: 41e6, marketCap: 5e9, ageSeconds: null, category: "other", narrative: "Meme majors", underlying: null, activity: 14 },
  { mint: "fixture-wif", symbol: "WIF", name: "dogwifhat", price: 0.7123, change: -1.1, volume: 320e6, liquidity: 26e6, marketCap: 710e6, ageSeconds: null, category: "other", narrative: "Meme majors", underlying: null, activity: 11 },
  { mint: "fixture-kova", symbol: "KOVA", name: "Kova Token", price: 0.0042, change: 24.8, volume: 2.6e6, liquidity: 0.9e6, marketCap: 4.2e6, ageSeconds: 86400 * 6, category: "meme-stock", narrative: "Kova", underlying: null, activity: 66, meme: true },
  { mint: "fixture-giga", symbol: "GIGA", name: "Gigachad", price: 0.0187, change: -3.2, volume: 4.1e6, liquidity: 1.6e6, marketCap: 18.7e6, ageSeconds: 86400 * 21, category: "meme-stock", narrative: "Degen plays", underlying: null, activity: 18, meme: true },
  { mint: "fixture-bome", symbol: "BOME", name: "Book of Meme", price: 0.0621, change: 8.7, volume: 12.3e6, liquidity: 3.9e6, marketCap: 62e6, ageSeconds: 86400 * 40, category: "meme-stock", narrative: "Meme majors", underlying: null, activity: 27, meme: true },
  { mint: "fixture-wif-pomp", symbol: "WIF", name: "dogwifhat", price: 0.7123, change: -1.1, volume: 320e6, liquidity: 26e6, marketCap: 710e6, ageSeconds: 86400 * 90, category: "meme-stock", narrative: "Meme majors", underlying: null, activity: 11, meme: true },
  { mint: "fixture-popcat", symbol: "POPCAT", name: "Popcat", price: 1.284, change: 15.6, volume: 9.4e6, liquidity: 2.7e6, marketCap: 1.2e9, ageSeconds: 86400 * 55, category: "meme-stock", narrative: "Meme majors", underlying: null, activity: 22, meme: true },
  { mint: "fixture-nvdge", symbol: "NVDGE", name: "Nvidia Doge", price: 0.00481, change: 31.4, volume: 1.9e6, liquidity: 0.62e6, marketCap: 4.8e6, ageSeconds: 3600 * 7, category: "meme-stock", narrative: "AI & chips", underlying: "NVDA", activity: 5, meme: true },
];

function sparkFor(seed: string, change: number): number[] {
  // Deterministic wobble that ends in the direction of `change`.
  let state = 0;
  for (const char of seed) state = (state * 31 + char.charCodeAt(0)) >>> 0;
  const points: number[] = [];
  let value = 100;
  for (let index = 0; index < 24; index += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const noise = (state / 0xffffffff - 0.5) * 6;
    value += noise + change / 24;
    points.push(Number(value.toFixed(3)));
  }
  return points;
}

function toAsset(seed: SeedAsset, now: number): MarketAsset {
  const launchedAt = seed.ageSeconds === null ? null : new Date(now - seed.ageSeconds * 1000).toISOString();
  return {
    mint: seed.mint,
    symbol: seed.symbol,
    name: seed.name,
    imageUrl: null,
    priceUsd: seed.price,
    change24hPct: seed.change,
    volume24hUsd: seed.volume,
    liquidityUsd: seed.liquidity,
    marketCapUsd: seed.marketCap,
    high24hUsd: Number((seed.price * (1 + Math.abs(seed.change) / 100 * 0.6 + 0.01)).toPrecision(6)),
    low24hUsd: Number((seed.price * (1 - Math.abs(seed.change) / 100 * 0.6 - 0.01)).toPrecision(6)),
    launchedAt,
    ageSeconds: seed.ageSeconds,
    source: seed.meme ? "clawpump / pump.fun" : "other",
    category: seed.category,
    underlyingTicker: seed.underlying,
    narrative: seed.narrative,
    sparkline: sparkFor(seed.mint, seed.change),
    kovaActivityCount: seed.activity,
    eligibility: { prediction: true, trading: seed.trading ?? true, reason: null },
  };
}

export function allAssets(now: number = Date.now()): MarketAsset[] {
  return SEED_ASSETS.filter((seed) => seed.mint !== "fixture-wif-pomp").map((seed) => toAsset(seed, now));
}

export function memeAssets(now: number = Date.now()): PompAsset[] {
  return SEED_ASSETS.filter((seed) => seed.meme).map((seed) => ({
    ...toAsset(seed, now),
    source: "clawpump / pump.fun" as const,
    trendScore: seed.activity,
    attentionScore: seed.activity,
  }));
}

/** The trending strip on Home: the five most-played majors. */
export const TRENDING_MINTS = ["fixture-gme", "fixture-amc", "fixture-nvda", "fixture-tsla", "fixture-spy"];
/** The Trading rail order. */
export const RAIL_MINTS = ["fixture-gme", "fixture-amc", "fixture-nvda", "fixture-tsla", "fixture-spy", "fixture-doge", "fixture-pepe", "fixture-wif"];

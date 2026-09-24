import type { Candle, MarketTrade, Timeframe } from "@/types/market";
import type { PortfolioSummary } from "@/types/portfolio";
import type { CompetitionPosition, Trade, TradeQuote, TradingMatchState, DraftOrder } from "@/types/trading";
import { RAIL_MINTS } from "./data";

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
  "1w": 604800,
};

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/** Deterministic candles that end on `price`, so the chart and header agree. */
export function fixtureCandles(mint: string, timeframe: Timeframe, price: number, now: number = Date.now()): Candle[] {
  const random = seededRandom(`${mint}:${timeframe}`);
  const step = TIMEFRAME_SECONDS[timeframe];
  const count = 96;
  const volatility = timeframe === "1m" ? 0.004 : timeframe === "5m" ? 0.006 : timeframe === "1h" ? 0.012 : 0.02;
  const end = Math.floor(now / 1000 / step) * step;
  // Walk backwards from the current price so the last close matches it.
  const closes: number[] = new Array(count);
  closes[count - 1] = price;
  for (let index = count - 2; index >= 0; index -= 1) {
    const drift = (random() - 0.47) * volatility;
    closes[index] = Math.max(price * 0.05, closes[index + 1] / (1 + drift));
  }
  return closes.map((close, index) => {
    const open = index === 0 ? close * (1 + (random() - 0.5) * volatility) : closes[index - 1];
    const wick = Math.abs(close - open) * (0.3 + random() * 0.9) + close * 0.0015;
    return {
      time: end - (count - 1 - index) * step,
      open,
      close,
      high: Math.max(open, close) + wick,
      low: Math.min(open, close) - wick,
      volume: Math.round((0.4 + random()) * 1000 * (1 + Math.abs(close - open) / close * 60)),
    };
  });
}

export function fixtureRecentTrades(price: number, now: number = Date.now()): MarketTrade[] {
  const makers = ["anon_7f3e", "diamondhands", "moonchaser", "stonksonly", "kryptoape", "cattrades", "soldeygen", "anon_b42d"];
  return makers.map((maker, index) => {
    const side = index % 3 === 1 ? "sell" : "buy";
    const tradePrice = Number((price * (1 + (index % 2 === 0 ? 0.0004 : -0.0007) * (index + 1) * 0.3)).toFixed(price < 1 ? 6 : 2));
    const amount = [420, 100, 250, 69, 1000, 150, 500, 200][index];
    return {
      id: `fixture-trade-${index}`,
      time: new Date(now - index * 3500).toISOString(),
      priceUsd: tradePrice,
      amount,
      totalUsd: Number((tradePrice * amount).toFixed(2)),
      maker,
      side,
    };
  });
}

export const FIXTURE_POSITION: CompetitionPosition = {
  assetMint: "fixture-gme",
  symbol: "GME",
  quantity: "250.00",
  averageEntryUsd: 27.2,
  markPriceUsd: 28.42,
  currentValueUsd: 7105,
  realizedPnlUsd: 320.14,
  unrealizedPnlUsd: 1072.5,
  realizedPnlPct: 4.9,
  unrealizedPnlPct: 17.8,
  totalPnlPct: 22.1,
  totalPnlUsd: 1392.64,
};

export function fixtureTradingState(tableId: string, now: number = Date.now()): TradingMatchState {
  return {
    tableId,
    eligibleMints: RAIL_MINTS,
    balance: { symbol: "USD", availableUsd: 1250 },
    positions: [FIXTURE_POSITION],
    totalPnlPct: FIXTURE_POSITION.totalPnlPct,
    trades: [
      { id: "fixture-t1", tableId, assetMint: "fixture-gme", symbol: "GME", side: "buy", inputAmount: "3000.00", outputAmount: "124.3", effectivePriceUsd: 27.05, feeUsd: 15, status: "confirmed", createdAt: new Date(now - 41 * 60_000).toISOString(), confirmedAt: new Date(now - 41 * 60_000 + 6000).toISOString() },
      { id: "fixture-t2", tableId, assetMint: "fixture-gme", symbol: "GME", side: "sell", inputAmount: "40.0", outputAmount: "1015.60", effectivePriceUsd: 27.9, feeUsd: 5.08, status: "confirmed", createdAt: new Date(now - 26 * 60_000).toISOString(), confirmedAt: new Date(now - 26 * 60_000 + 5000).toISOString() },
      { id: "fixture-t3", tableId, assetMint: "fixture-gme", symbol: "GME", side: "buy", inputAmount: "3000.00", outputAmount: "125.7", effectivePriceUsd: 27.32, feeUsd: 15, status: "confirmed", createdAt: new Date(now - 12 * 60_000).toISOString(), confirmedAt: new Date(now - 12 * 60_000 + 7000).toISOString() },
    ],
    execution: "live",
    executionNote: "Sample data - no real trade will be sent.",
  };
}

/**
 * A fixture quote. It only exists to drive the review sheet in development; a
 * real quote is issued by the backend and displayed verbatim.
 */
export function fixtureQuote(order: DraftOrder, price: number, now: number = Date.now()): TradeQuote {
  const fee = Number((order.inputUsd * 0.005).toFixed(2));
  const quantity = (order.inputUsd - fee) / price;
  return {
    quoteId: `fixture-quote-${now}`,
    expiresAt: new Date(now + 30_000).toISOString(),
    side: order.side,
    assetMint: order.assetMint,
    symbol: order.symbol,
    inputAmount: order.inputUsd.toFixed(2),
    inputSymbol: "USD",
    estimatedOutputAmount: quantity.toFixed(price < 1 ? 0 : 3),
    outputSymbol: order.symbol,
    executionPriceUsd: price,
    priceImpactPct: 0.08,
    feeUsd: fee,
    route: "Sample route",
  };
}

const fixtureTradeStarts = new Map<string, { quote: TradeQuote; tableId: string; at: number }>();

/** Registers a sample trade whose lifecycle `fixtureTradeStatus` advances over time. */
export function fixtureBeginTrade(quote: TradeQuote, tableId: string): Trade {
  fixtureTradeStarts.set(quote.quoteId, { quote, tableId, at: Date.now() });
  return fixtureTrade(quote, tableId, "awaiting_wallet");
}

/** Sample lifecycle: wallet -> submitted -> confirming -> confirmed. A 666 amount fails, to exercise that state. */
export function fixtureTradeStatus(tradeId: string): Trade | null {
  const quoteId = tradeId.replace("fixture-trade-", "");
  const entry = fixtureTradeStarts.get(quoteId);
  if (!entry) return null;
  const elapsed = Date.now() - entry.at;
  if (entry.quote.inputAmount.startsWith("666")) {
    return elapsed < 1500
      ? fixtureTrade(entry.quote, entry.tableId, "awaiting_wallet")
      : { ...fixtureTrade(entry.quote, entry.tableId, "failed"), failureReason: "The wallet request was rejected. Nothing was sent." };
  }
  const status: Trade["status"] = elapsed < 1500 ? "awaiting_wallet" : elapsed < 3000 ? "submitted" : elapsed < 4800 ? "confirming" : "confirmed";
  return fixtureTrade(entry.quote, entry.tableId, status);
}

export function fixtureTrade(quote: TradeQuote, tableId: string, status: Trade["status"]): Trade {
  return {
    id: `fixture-trade-${quote.quoteId}`,
    tableId,
    assetMint: quote.assetMint,
    symbol: quote.symbol,
    side: quote.side,
    inputAmount: quote.inputAmount,
    outputAmount: quote.estimatedOutputAmount,
    effectivePriceUsd: quote.executionPriceUsd,
    feeUsd: quote.feeUsd,
    // Deliberately absent: a fixture must never carry something shaped like a real signature.
    txSignature: null,
    status,
    createdAt: new Date().toISOString(),
    confirmedAt: status === "confirmed" ? new Date().toISOString() : null,
  };
}

/* --- portfolio ----------------------------------------------------------- */

export function fixturePortfolio(now: number = Date.now()): PortfolioSummary {
  const history: Array<{ time: number; valueUsd: number }> = [];
  const random = seededRandom("portfolio");
  let value = 11200;
  for (let index = 0; index < 96; index += 1) {
    value += (random() - 0.42) * 90 + (index > 40 ? 12 : 0);
    history.push({ time: Math.floor(now / 1000) - (95 - index) * 900, valueUsd: Number(value.toFixed(2)) });
  }
  history[history.length - 1] = { ...history[history.length - 1], valueUsd: 12843.32 };

  return {
    totalValueUsd: 12843.32,
    change24hUsd: 1642.21,
    change24hPct: 14.65,
    availableUsd: 2340.12,
    inCompetitionsUsd: 4500,
    totalPnlUsd: 3082.21,
    totalPnlPct: 31.5,
    balances: [
      { symbol: "USDC", amount: "2340.12", valueUsd: 2340.12 },
      { symbol: "SOL", amount: "25.42", valueUsd: 3765.98 },
    ],
    holdings: [
      { mint: "fixture-sol", symbol: "SOL", name: "Solana", imageUrl: null, kind: "crypto", quantity: 25.42, priceUsd: 148.21, change24hPct: 3.4, valueUsd: 3765.98, averageEntryUsd: 112.3, pnlUsd: 912.18, pnlPct: 31.9 },
      { mint: "fixture-nvda", symbol: "NVDA", name: "NVIDIA", imageUrl: null, kind: "stock", quantity: 12, priceUsd: 875.21, change24hPct: 2.1, valueUsd: 10502.52, averageEntryUsd: 710.18, pnlUsd: 1981.56, pnlPct: 23.3 },
      { mint: "fixture-btc", symbol: "BTC", name: "Bitcoin", imageUrl: null, kind: "crypto", quantity: 0.15, priceUsd: 68221.1, change24hPct: 1.6, valueUsd: 10233.17, averageEntryUsd: 62450, pnlUsd: 865.17, pnlPct: 9.2 },
      { mint: "fixture-eth", symbol: "ETH", name: "Ethereum", imageUrl: null, kind: "crypto", quantity: 1.2, priceUsd: 3456.82, change24hPct: -0.8, valueUsd: 4148.18, averageEntryUsd: 3612.45, pnlUsd: -186.76, pnlPct: -4.3 },
      { mint: "fixture-doge", symbol: "DOGE", name: "Dogecoin", imageUrl: null, kind: "crypto", quantity: 5000, priceUsd: 0.1623, change24hPct: 5.7, valueUsd: 811.5, averageEntryUsd: 0.0841, pnlUsd: 391, pnlPct: 92.6 },
      { mint: "fixture-kova", symbol: "KOVA", name: "Kova Token", imageUrl: null, kind: "kova", quantity: 2500, priceUsd: 0.0042, change24hPct: 1.9, valueUsd: 10.5, averageEntryUsd: 0.0058, pnlUsd: -4, pnlPct: -27.6 },
    ],
    allocations: [
      { tableId: "fixture-table-meme-majors", tableName: "Meme Majors", marketLabel: "GME, AMC, NVDA, TSLA", status: "live", allocatedUsd: 2000, returnPct: 44.4 },
      { tableId: "fixture-table-degens-only", tableName: "Degens Only", marketLabel: "High volatility. Higher stakes.", status: "live", allocatedUsd: 1500, returnPct: 12.1 },
      { tableId: "fixture-table-ai-vs-memes", tableName: "AI vs Memes", marketLabel: "NVDA, TSLA, SPY, COIN", status: "live", allocatedUsd: 1000, returnPct: 6.8 },
    ],
    activity: [
      { id: "act1", kind: "buy", title: "Bought SOL", detail: "+12.50 SOL @ $142.20", at: new Date(now - 2 * 3600_000).toISOString() },
      { id: "act2", kind: "join", title: "Joined Meme Majors", detail: "$500.00 entry", at: new Date(now - 5 * 3600_000).toISOString() },
      { id: "act3", kind: "swap", title: "Swapped USDC → KOVA", detail: "1,000 USDC → 238,095 KOVA", at: new Date(now - 8 * 3600_000).toISOString() },
      { id: "act4", kind: "sell", title: "Sold NVDA", detail: "-2.00 NVDA @ $860.14", at: new Date(now - 26 * 3600_000).toISOString() },
      { id: "act5", kind: "receive", title: "Received from wallet", detail: "+500 USDC", at: new Date(now - 50 * 3600_000).toISOString() },
    ],
    history,
    wallet: { provider: "Kova Wallet", address: "7F3aXk2Q9dPvB6mNhY4tLw8RzE1cUj5s9K2u", connected: true },
  };
}

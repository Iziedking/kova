import type {
  CompetitionStanding,
  DealerMessageItem,
  PredictionViewerState,
  PublicTableSummary,
  ShowdownResult,
  TableActivityItem,
  TableDetail,
  TableSeat,
} from "@/types/competition";
import { FIXTURE_PLAYERS, fixtureAnsem } from "./data";

interface SeedTable {
  id: string;
  name: string;
  mode: "prediction" | "trading";
  status: PublicTableSummary["status"];
  stake: number;
  durationSeconds: number;
  remainingSeconds: number | null;
  players: string[];
  filled: number;
  max: number;
  marketLabel: string;
  tagline: string;
}

const SEED_TABLES: SeedTable[] = [
  { id: "fixture-table-meme-majors", name: "Meme Majors", mode: "prediction", status: "active", stake: 200, durationSeconds: 3600, remainingSeconds: 28 * 60 + 14, players: ["ANSEM", "kryp2moon", "traderanon", "dewildcat"], filled: 16, max: 16, marketLabel: "GME, AMC, NVDA, TSLA", tagline: "" },
  { id: "fixture-table-degens-only", name: "Degens Only", mode: "trading", status: "active", stake: 500, durationSeconds: 3600 * 2, remainingSeconds: 3600 + 12 * 60, players: ["memelord", "degenzen", "cattrades", "moonbagz"], filled: 12, max: 16, marketLabel: "High volatility. Higher stakes.", tagline: "High volatility. Higher stakes." },
  { id: "fixture-table-ai-vs-memes", name: "AI vs Memes", mode: "prediction", status: "active", stake: 100, durationSeconds: 3600, remainingSeconds: 15 * 60 + 32, players: ["kryp2moon", "memelord", "jaymo", "slickrick"], filled: 20, max: 24, marketLabel: "NVDA, TSLA, SPY, COIN", tagline: "" },
  { id: "fixture-table-open-duel", name: "Blitz Duel", mode: "trading", status: "open", stake: 50, durationSeconds: 900, remainingSeconds: null, players: ["traderanon"], filled: 1, max: 2, marketLabel: "Any eligible meme stock", tagline: "Waiting for an opponent" },
  { id: "fixture-table-predict-open", name: "Sunday Pick 'Em", mode: "prediction", status: "open", stake: 25, durationSeconds: 900, remainingSeconds: null, players: ["jaymo", "cattrades"], filled: 2, max: 4, marketLabel: "Any eligible meme stock", tagline: "Two seats left" },
];

function summary(seed: SeedTable, now: number): PublicTableSummary {
  const endsAt = seed.remainingSeconds === null ? null : new Date(now + seed.remainingSeconds * 1000).toISOString();
  const startsAt = endsAt === null ? null : new Date(now + seed.remainingSeconds! * 1000 - seed.durationSeconds * 1000).toISOString();
  return {
    id: seed.id,
    name: seed.name,
    mode: seed.mode,
    status: seed.status,
    visibility: "public",
    stakeAnsemRaw: fixtureAnsem(seed.stake),
    potAnsemRaw: fixtureAnsem(seed.stake * seed.filled),
    durationSeconds: seed.durationSeconds,
    startsAt,
    endsAt,
    opensUntil: seed.status === "open" ? new Date(now + 8 * 60_000).toISOString() : null,
    players: seed.players.map((username) => ({ username, avatarUrl: null })),
    filledSeats: seed.filled,
    maxPlayers: seed.max,
    marketLabel: seed.marketLabel,
    tagline: seed.tagline || null,
  };
}

export function fixtureTables(now: number = Date.now()): PublicTableSummary[] {
  return SEED_TABLES.map((seed) => summary(seed, now));
}

function detailSeats(seed: SeedTable): TableSeat[] {
  const seats: TableSeat[] = [];
  for (let index = 0; index < Math.min(seed.max, 6); index += 1) {
    const username = seed.players[index] ?? null;
    seats.push({
      seat: index + 1,
      player: username ? { username, avatarUrl: null } : null,
      readiness: username ? (seed.mode === "prediction" ? "locked" : "funded") : "empty",
      isViewer: username === "ANSEM",
    });
  }
  return seats;
}

const DEALER: DealerMessageItem[] = [
  { id: "d1", at: "", text: "Table is live. All picks are locked - nobody can change them now.", tone: "info" },
  { id: "d2", at: "", text: "Retail names are moving fast this hour. Volume is up across the board.", tone: "hype" },
  { id: "d3", at: "", text: "Reminder: the strongest percentage move at the bell wins the pot.", tone: "info" },
];

export function fixtureTableDetail(id: string, now: number = Date.now()): TableDetail | null {
  const seed = SEED_TABLES.find((candidate) => candidate.id === id);
  if (!seed) return null;
  const base = summary(seed, now);
  const activity: TableActivityItem[] = [
    { id: "a1", at: new Date(now - 14 * 60_000).toISOString(), kind: "joined", text: `@${seed.players[1] ?? "kryp2moon"} took a seat` },
    { id: "a2", at: new Date(now - 11 * 60_000).toISOString(), kind: "locked", text: `@${seed.players[0]} locked in` },
    { id: "a3", at: new Date(now - 9 * 60_000).toISOString(), kind: "status", text: "Match started" },
  ];
  return {
    ...base,
    seats: detailSeats(seed),
    viewerState: seed.players.includes("ANSEM") ? "joined" : "none",
    standings: seed.mode === "trading" ? standings() : null,
    dealer: DEALER.map((message, index) => ({ ...message, at: new Date(now - (index + 1) * 4 * 60_000).toISOString() })),
    activity,
    serverTime: new Date(now).toISOString(),
    dealerStatus: "ready",
    financialStatus: "funded",
  };
}

export function standings(): CompetitionStanding[] {
  return [
    { rank: 1, username: "ANSEM", avatarUrl: null, netPnlPct: 28.4, isViewer: true },
    { rank: 2, username: "traderanon", avatarUrl: null, netPnlPct: 12.1, isViewer: false },
  ];
}

export function fixturePredictionState(phase: PredictionViewerState["phase"] = "active"): PredictionViewerState {
  return {
    phase,
    hasLockedPick: phase !== "picking",
    admission: phase === "picking" ? null : "accepted",
    commitmentShort: phase === "picking" ? null : "08a068f8…c2e97",
  };
}

export function fixtureShowdown(tableId: string): ShowdownResult {
  const players = FIXTURE_PLAYERS.slice(0, 5);
  const returns = [284.6, 112.3, 98.7, 76.4, 62.1];
  const symbols = ["GME", "NVDA", "TSLA", "AMC", "PEPE"];
  const names = ["GameStop Corp.", "NVIDIA Corp.", "Tesla, Inc.", "AMC Entertainment", "Pepe"];
  return {
    tableId,
    tableName: "Meme Majors",
    mode: tableId.includes("degens") ? "trading" : "prediction",
    standings: players.map((player, index) => ({
      rank: index + 1,
      username: player.username,
      avatarUrl: null,
      netPnlPct: returns[index],
      isViewer: index === 0,
      payoutAnsemRaw: index === 0 ? fixtureAnsem(200) : null,
    })),
    reveals: players.map((player, index) => ({
      username: player.username,
      avatarUrl: null,
      symbol: symbols[index],
      name: names[index],
      startPriceUsd: 100,
      endPriceUsd: Number((100 * (1 + returns[index] / 100)).toFixed(2)),
      returnPct: returns[index],
      isWinner: index === 0,
      isViewer: index === 0,
    })),
    viewerRank: 1,
    totalPlayers: 248,
    potAnsemRaw: fixtureAnsem(200),
    viewerPayoutAnsemRaw: fixtureAnsem(200),
    settledAt: new Date().toISOString(),
    payoutStatus: "paid",
  };
}

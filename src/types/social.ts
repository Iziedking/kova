import type { CompetitionMode } from "./competition";

export interface PlayerProfile {
  id: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  verified?: boolean;

  rating?: number | null;

  stats: {
    matches: number;
    wins: number;
    predictionWinRate?: number | null;
    tradingWinRate?: number | null;
    avgTradingPnlPct?: number | null;
    bestTradingPnlPct?: number | null;
    avgPredictionReturnPct?: number | null;
    currentStreak?: number | null;
  };

  favoriteNarrative?: string | null;
  joinedAt?: string | null;
}

export interface HotPlayer {
  rank: number;
  username: string;
  displayName?: string | null;
  handle?: string | null;
  avatarUrl: string | null;
  verified?: boolean;
  /** The single headline stat, e.g. the period PnL %. */
  performancePct: number | null;
  streak?: number | null;
}

export interface RecentShowdown {
  id: string;
  winner: string;
  loser: string;
  winnerAvatarUrl: string | null;
  tableName: string;
  mode: CompetitionMode;
  /** Net ANSEM won by the winner, raw base units. */
  payoutAnsemRaw: string;
  settledAt: string;
}

export type LeaderboardScope = "overall" | "prediction" | "trading";

export interface LeaderboardRow {
  rank: number;
  username: string;
  avatarUrl: string | null;
  verified?: boolean;
  rating: number | null;
  matches: number;
  winRatePct: number | null;
  /** Prediction win rate or trading average PnL, depending on scope. */
  modeStatPct: number | null;
  modeStatLabel: string;
  streak: number | null;
}

export interface MatchHistoryItem {
  id: string;
  tableId: string;
  tableName: string;
  mode: CompetitionMode;
  opponents: string[];
  result: "won" | "lost" | "draw" | "voided";
  returnPct: number | null;
  payoutAnsemRaw: string | null;
  settledAt: string;
}

/** The viewer's own Kova identity: what other players see. */
export interface KovaIdentity {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarSeed: string;
}

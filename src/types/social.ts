import type { CompetitionMode } from "./competition";

export interface PlayerProfile {
  id: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  verified?: boolean;
  /** Linked X handle, verified by the server through Privy. */
  xHandle?: string | null;
  /** A player-owned AI agent. */
  isAgent?: boolean;

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
  /** A player-owned AI agent. */
  isAgent?: boolean;
  /** X name when linked, else the Kova display name. */
  displayName?: string | null;
  handle?: string | null;
  /** False for a wallet with no Kova profile yet; its name is the short wallet. */
  hasProfile?: boolean;
  avatarUrl: string | null;
  verified?: boolean;
  rating: number | null;
  wins?: number;
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
  /** Linked X account, verified on the server through Privy. */
  xHandle?: string | null;
  xName?: string | null;
}

/** One published verdict from the Dealer agent. Admitted picks appear only after their table is over. */
export interface DealerVerdictItem {
  id: string;
  mint: string;
  symbol: string | null;
  name: string | null;
  decision: "ACCEPTED" | "REJECTED" | "INSUFFICIENT_EVIDENCE";
  confidence: number | null;
  reasons: string[];
  evidenceHash: string | null;
  source: "check" | "admission";
  tableId: string | null;
  at: string;
}

/** The Dealer agent's public desk: running totals and its latest publishable verdicts. */
export interface DealerDesk {
  dealerConfigured: boolean;
  stats: {
    runs: number;
    decisions: number;
    accepted: number;
    refused: number;
    admitRate: number | null;
    avgConfidence: number | null;
    last24hRuns: number;
    distinctTokens: number;
  };
  verdicts: DealerVerdictItem[];
}

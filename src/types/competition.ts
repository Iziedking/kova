/**
 * Frontend-facing competition contracts (blueprint section 37).
 *
 * The backend `PublicTable` (src/domain/game/api-contracts.ts) is a narrower,
 * prediction-only shape without player identities. `services/adapters/game-table`
 * maps it into `PublicTableSummary` and leaves every field the backend does not
 * yet supply as null or empty - never invented.
 */
export type CompetitionMode = "prediction" | "trading";

export type TableStatus = "open" | "waiting" | "active" | "settling" | "settled" | "cancelled";

export type TableVisibility = "public" | "private";

export type TableViewerState = "none" | "joined" | "owner";

export interface TablePlayerSummary {
  username: string;
  avatarUrl: string | null;
}

export interface PublicTableSummary {
  id: string;
  name: string;
  mode: CompetitionMode;
  status: TableStatus;
  visibility: TableVisibility;

  /** Raw ANSEM base units (6 decimals). Strings so precision is never lost. */
  stakeAnsemRaw: string;
  potAnsemRaw: string | null;

  durationSeconds: number;
  startsAt: string | null;
  endsAt: string | null;
  opensUntil: string | null;

  /** Players the backend has identified. May be shorter than `filledSeats`. */
  players: TablePlayerSummary[];
  filledSeats: number;
  maxPlayers: number;

  /** Public market label, e.g. `GME, AMC, NVDA, TSLA`. Never a hidden pick. */
  marketLabel: string | null;
  tagline: string | null;
}

/** Live standing inside a trading competition. Ranked by net PnL %, never dollars. */
export interface CompetitionStanding {
  rank: number;
  username: string;
  avatarUrl: string | null;
  netPnlPct: number | null;
  isViewer: boolean;
}

export type SeatReadiness = "empty" | "invited" | "joined" | "funded" | "locked" | "ready";

export interface TableSeat {
  seat: number;
  player: TablePlayerSummary | null;
  readiness: SeatReadiness;
  isViewer: boolean;
}

export interface DealerMessageItem {
  id: string;
  at: string;
  text: string;
  tone: "info" | "hype" | "warning";
}

export interface TableActivityItem {
  id: string;
  at: string;
  kind: "joined" | "locked" | "trade" | "dealer" | "status";
  text: string;
}

/** Everything a table page needs. Fields are null when the backend does not supply them. */
export interface TableDetail extends PublicTableSummary {
  seats: TableSeat[];
  viewerState: TableViewerState;
  standings: CompetitionStanding[] | null;
  dealer: DealerMessageItem[];
  activity: TableActivityItem[];
  /** Server clock at read time, used to derive countdowns without trusting the client clock. */
  serverTime: string;
  dealerStatus: "ready" | "degraded" | "unavailable" | null;
  /** Backend financial lifecycle, shown honestly (e.g. funding not live yet). */
  financialStatus: string | null;
}

export interface CreateTableInput {
  mode: CompetitionMode;
  visibility: TableVisibility;
  stakeAnsem: number;
  durationSeconds: number;
  playerCount: number;
  marketRule: "any" | "same-ticker" | "specific";
  marketMint?: string | null;
  name?: string;
}

export interface ChallengeInput {
  opponentUsername: string;
  mode: CompetitionMode;
  stakeAnsem: number;
  durationSeconds: number;
  marketRule: "any" | "same-ticker" | "specific";
  marketMint?: string | null;
}

export interface GameCapabilityState {
  key: string;
  label: string;
  state: "live" | "read_only" | "preview_only" | "local_validator_only" | "unavailable" | "blocked";
}

/* --- Prediction ------------------------------------------------------- */

export type PredictionPhase = "picking" | "locked" | "active" | "settling" | "revealed";

export interface PredictionViewerState {
  phase: PredictionPhase;
  /** True once the viewer's pick is committed. The pick itself is never in this shape. */
  hasLockedPick: boolean;
  admission: "pending" | "accepted" | "rejected" | "insufficient_evidence" | null;
  commitmentShort: string | null;
}

export interface RevealedPick {
  username: string;
  avatarUrl: string | null;
  symbol: string;
  name: string;
  startPriceUsd: number;
  endPriceUsd: number;
  returnPct: number;
  isWinner: boolean;
  isViewer: boolean;
}

export interface ShowdownResult {
  tableId: string;
  tableName: string;
  mode: CompetitionMode;
  /** Ranked best first. */
  standings: Array<CompetitionStanding & { payoutAnsemRaw: string | null }>;
  reveals: RevealedPick[] | null;
  viewerRank: number | null;
  totalPlayers: number;
  potAnsemRaw: string;
  viewerPayoutAnsemRaw: string | null;
  settledAt: string | null;
  payoutStatus: "pending" | "paid" | "refunded" | "not_applicable";
}

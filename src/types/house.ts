/** The KOVA House trader's public record. Decisions appear only after their match is over. */
export interface HouseDecision {
  id: string;
  tableId: string;
  tableName: string;
  source: "agent" | "rules" | "risk";
  view: string | null;
  executed: { side: string; symbol: string; usd: number | null; feeUsd?: number | null; reason?: string }[];
  refused: { order: { side: string; mint: string; usd: number; reason: string }; why: string }[];
  equityUsd: number | null;
  pnlPct: number | null;
  at: string;
}

export interface HouseRecord {
  enabled: boolean;
  brain: "clawpump" | "rules";
  rules: {
    lobbyStake: string; lobbyRoundSeconds: number; stopLossPct: number; maxPositions: number; maxExposure: number;
    maxOrderShare: number; maxDecisionsPerMatch: number; dailyLossLimitAnsem: number; minLiquidityUsd: number;
  };
  stats: { matches: number; wins: number; winRatePct: number | null; avgTradingPnlPct: number | null; bestTradingPnlPct: number | null; netRaw: string } | null;
  history: { tableId: string; tableName: string; opponents: string[]; result: "won" | "lost" | "draw"; returnPct: number | null; payoutRaw: string; settledAt: string }[];
  vault: string | null;
  stakeCount: number;
  stakedRaw: string;
  stakes: { tableId: string; tableName: string; stakeRaw: string; signature: string; at: string }[];
  live: { tableId: string; name: string; status: string; endsAt: string | null }[];
  lobby: { tableId: string; name: string } | null;
  decisions: HouseDecision[];
}

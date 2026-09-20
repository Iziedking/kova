export interface PortfolioBalance {
  symbol: string;
  amount: string;
  valueUsd: number | null;
}

export interface PortfolioHolding {
  mint: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  kind: "crypto" | "stock" | "kova";
  quantity: number;
  priceUsd: number | null;
  change24hPct: number | null;
  valueUsd: number | null;
  averageEntryUsd: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
}

export interface CompetitionAllocation {
  tableId: string;
  tableName: string;
  marketLabel: string | null;
  status: "live" | "settling";
  allocatedUsd: number | null;
  returnPct: number | null;
}

export interface PortfolioActivityItem {
  id: string;
  kind: "buy" | "sell" | "join" | "swap" | "receive" | "send" | "payout";
  title: string;
  detail: string;
  at: string;
  /** Present only for confirmed onchain activity. */
  txSignature?: string | null;
}

export interface PortfolioSummary {
  totalValueUsd: number | null;
  change24hUsd: number | null;
  change24hPct: number | null;
  availableUsd: number | null;
  inCompetitionsUsd: number | null;
  totalPnlUsd: number | null;
  totalPnlPct: number | null;

  balances: PortfolioBalance[];
  holdings: PortfolioHolding[];
  allocations: CompetitionAllocation[];
  activity: PortfolioActivityItem[];
  /** Portfolio value over the requested window, for the chart. */
  history: Array<{ time: number; valueUsd: number }> | null;

  wallet: {
    provider: string | null;
    address: string | null;
    connected: boolean;
  };
}

export type PortfolioWindow = "1H" | "1D" | "1W" | "1M" | "1Y" | "ALL";

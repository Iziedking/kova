import type { Capability } from "./contracts";

export interface DiscoverMarket {
  id: string;
  pair: string;
  community: string;
  stockSymbol: string;
  stockMint: string;
  stockProgramId: string;
  stockDecimals: number;
  memeSymbol: string;
  memeMint: string;
  memeProgramId: string;
  memeDecimals: number;
  pool: string;
  raydiumProgram: string;
  tvlUsdMicro: string | null;
  volume24hUsdMicro: string | null;
  capability: Capability;
  status: "captured_snapshot" | "needs_review";
  riskLabel: "Review required" | "Thin exit depth" | "Token-2022 review";
  snapshotAt: string;
}

const capturedAt = "2026-09-15T05:43:20.436Z";
const raydium = "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK";
const token2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const token = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

/** Exact research identities. Metrics are dated snapshots, never live claims. */
export const MARKET_CATALOG: readonly DiscoverMarket[] = [
  {
    id: "nvdge-nvdax",
    pair: "NVDGE / NVDAx",
    community: "The compute crowd",
    stockSymbol: "NVDAx",
    stockMint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    stockProgramId: token2022,
    stockDecimals: 8,
    memeSymbol: "NVDGE",
    memeMint: "Aigf5pKPyZW8nzxCrHEisE4tZMiUhFpKie8mYE7cmj6c",
    memeProgramId: token,
    memeDecimals: 9,
    pool: "Ak7oAUqQ9jYu5YvfmDrtDC3WHi7BcN5Y4k8Bh3yk4B5e",
    raydiumProgram: raydium,
    tvlUsdMicro: "36759430000",
    volume24hUsdMicro: "35302017643",
    capability: "chain_confirmed",
    status: "captured_snapshot",
    riskLabel: "Review required",
    snapshotAt: capturedAt,
  },
  {
    id: "stonk-spyx",
    pair: "STONK / SPYx",
    community: "For the whole market",
    stockSymbol: "SPYx",
    stockMint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
    stockProgramId: token2022,
    stockDecimals: 8,
    memeSymbol: "STONK",
    memeMint: "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx",
    memeProgramId: token,
    memeDecimals: 9,
    pool: "7a8xxAJBELDo6P9dikSYctdw6ce8F4mWr3ahcAD8Ao49",
    raydiumProgram: raydium,
    tvlUsdMicro: "4552220420000",
    volume24hUsdMicro: "6555286348113",
    capability: "chain_confirmed",
    status: "captured_snapshot",
    riskLabel: "Review required",
    snapshotAt: capturedAt,
  },
];

export function marketById(id: string): DiscoverMarket | undefined {
  return MARKET_CATALOG.find((market) => market.id === id);
}

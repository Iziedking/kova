/**
 * The only facts the landing page may state.
 *
 * Every address and decimal is derived from MARKET_CATALOG rather than retyped,
 * so the public advertisement can never drift from the domain. The pinned values
 * are single observations recorded in .internal/STATUS.md from a finalized RPC
 * recheck; they are constants here because no live read backs the landing page.
 *
 * Spec sections 8.1 item 7 and 14.
 */
import { MARKET_CATALOG, type DiscoverMarket } from "../domain/market-catalog";

export interface EvidenceFact {
  label: string;
  value: string;
}

export const FEATURED_MARKET: DiscoverMarket = MARKET_CATALOG[0];

/** Observed in the finalized RPC recheck at slot 447218327. */
export const PINNED_POOL_OWNER = "5CEbueQnq1Ym2uSSx2xXds3jQAqT1BDnkA59RZobSPAG";
export const PINNED_SLOT = "447218327";
export const PINNED_TICK = "172510";

export const LANDING_CAPTURE_LABEL = "CAPTURED 15 SEP 2026 · READ ONLY";

export const LANDING_EVIDENCE: readonly EvidenceFact[] = [
  { label: "POOL", value: FEATURED_MARKET.pool },
  { label: "POOL OWNER", value: PINNED_POOL_OWNER },
  { label: "SLOT", value: PINNED_SLOT },
  { label: "STOCK MINT", value: FEATURED_MARKET.stockMint },
  { label: "STOCK PROGRAM", value: "Token-2022" },
  { label: "STOCK DECIMALS", value: String(FEATURED_MARKET.stockDecimals) },
  { label: "MEME MINT", value: FEATURED_MARKET.memeMint },
  { label: "MEME PROGRAM", value: "Classic SPL" },
  { label: "MEME DECIMALS", value: String(FEATURED_MARKET.memeDecimals) },
  { label: "SDK TICK", value: PINNED_TICK },
  { label: "TICK ARRAYS", value: "2" },
  { label: "REWARD MINTS", value: "0" },
];

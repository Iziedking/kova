import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatAge, formatCompact, formatUsd, formatUsdPrice } from "@/lib/format";
import type { MarketAsset } from "@/types/market";
import { Button } from "@/components/ui/button";
import { AssetAvatar } from "./asset-avatar";
import { MiniPriceChart } from "./mini-price-chart";
import { PriceChange } from "./price-change";

/** Column template shared by the header and every desktop row so they always align. */
export const MARKET_COLUMNS = "grid-cols-[minmax(200px,2fr)_110px_90px_110px_110px_70px_minmax(110px,1fr)_110px_84px]";

export function MarketTableHeader() {
  return (
    <div
      role="row"
      className={cn("hidden items-center gap-4 border-b border-border-subtle px-4 pb-3 text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted lg:grid", MARKET_COLUMNS)}
    >
      <span role="columnheader">Asset</span>
      <span role="columnheader" className="text-right">Price</span>
      <span role="columnheader" className="text-right">24h</span>
      <span role="columnheader" className="text-right">Volume</span>
      <span role="columnheader" className="text-right">Liquidity</span>
      <span role="columnheader" className="text-right">Age</span>
      <span role="columnheader">Narrative</span>
      <span role="columnheader" className="text-right">Kova activity</span>
      <span role="columnheader" className="sr-only">Action</span>
    </div>
  );
}

/**
 * One market. Desktop is a comparison row (blueprint 24); below 1024px it becomes
 * a compact row - icon, ticker, price, move, sparkline - and secondary stats move
 * to the asset page. The whole row opens the market; `Play` is the one shortcut.
 */
export function MarketRow({ asset }: { asset: MarketAsset }) {
  const href = `/markets/${encodeURIComponent(asset.mint)}`;
  return (
    <div role="row" className="group relative border-b border-border-subtle last:border-0">
      <Link href={href} aria-label={`${asset.symbol}, ${asset.name}`} className="absolute inset-0 z-0 rounded-lg focus-visible:outline-offset-[-2px]" />

      {/* Desktop */}
      <div className={cn("pointer-events-none relative z-10 hidden items-center gap-4 px-4 py-3 transition-colors group-hover:bg-surface-2 lg:grid", MARKET_COLUMNS)}>
        <div role="cell" className="flex min-w-0 items-center gap-3">
          <AssetAvatar symbol={asset.symbol} imageUrl={asset.imageUrl} size="md" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-text-primary">${asset.symbol}</p>
            <p className="truncate text-[12px] text-text-secondary">{asset.name}</p>
          </div>
        </div>
        <span role="cell" className="num text-right text-[14px] text-text-primary">{formatUsdPrice(asset.priceUsd)}</span>
        <span role="cell" className="text-right"><PriceChange value={asset.change24hPct} className="text-[14px]" /></span>
        <span role="cell" className="num text-right text-[14px] text-text-primary">{asset.volume24hUsd == null ? "—" : `$${formatCompact(asset.volume24hUsd)}`}</span>
        <span role="cell" className="num text-right text-[14px] text-text-primary">{asset.liquidityUsd == null ? "—" : formatUsd(asset.liquidityUsd, { compact: true })}</span>
        <span role="cell" className="num text-right text-[14px] text-text-secondary">{formatAge(asset.ageSeconds)}</span>
        <span role="cell" className="truncate text-[13px] text-text-secondary">{asset.narrative ?? "—"}</span>
        <span role="cell" className="num text-right text-[14px] text-text-primary">{asset.kovaActivityCount ?? "—"}</span>
        <span role="cell" className="pointer-events-auto text-right">
          <Button href={`/play?mode=prediction&market=${encodeURIComponent(asset.mint)}`} size="sm" variant="secondary" disabled={!asset.eligibility.prediction && !asset.eligibility.trading}>
            Play
          </Button>
        </span>
      </div>

      {/* Mobile / tablet */}
      <div className="pointer-events-none relative z-10 flex items-center gap-3 px-1 py-3 lg:hidden">
        <AssetAvatar symbol={asset.symbol} imageUrl={asset.imageUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-text-primary">${asset.symbol}</p>
          <p className="truncate text-[12px] text-text-secondary">{asset.name}</p>
        </div>
        <MiniPriceChart points={asset.sparkline} width={56} height={26} />
        <div className="w-[88px] shrink-0 text-right">
          <p className="num text-[14px] text-text-primary">{formatUsdPrice(asset.priceUsd)}</p>
          <PriceChange value={asset.change24hPct} className="text-[13px]" />
        </div>
      </div>
    </div>
  );
}

export function MarketRowSkeleton() {
  return (
    <div className="flex items-center gap-3 border-b border-border-subtle px-1 py-3 last:border-0 lg:px-4" aria-hidden="true">
      <div className="skeleton h-12 w-12 rounded-xl" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-4 w-20 rounded" />
        <div className="skeleton h-3 w-32 rounded" />
      </div>
      <div className="skeleton h-7 w-20 rounded" />
    </div>
  );
}

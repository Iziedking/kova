import Link from "next/link";
import { cn } from "@/lib/cn";
import { DIRECTION_TEXT, directionOf, formatPct, formatSignedUsd, formatUsd, formatUsdPrice } from "@/lib/format";
import { AssetAvatar } from "@/components/markets/asset-avatar";
import { PriceChange } from "@/components/markets/price-change";
import { Button } from "@/components/ui/button";
import type { PortfolioHolding } from "@/types/portfolio";

export const HOLDING_COLUMNS = "grid-cols-[minmax(130px,2fr)_84px_104px_104px_92px_104px_72px]";

export function HoldingsHeader() {
  return (
    <div role="row" className={cn("hidden items-center gap-3 border-b border-border-subtle px-5 pb-3 text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted lg:grid", HOLDING_COLUMNS)}>
      <span role="columnheader">Asset</span>
      <span role="columnheader" className="text-right">Quantity</span>
      <span role="columnheader" className="text-right">Current price</span>
      <span role="columnheader" className="text-right">Current value</span>
      <span role="columnheader" className="text-right">Avg. entry</span>
      <span role="columnheader" className="text-right">PnL</span>
      <span role="columnheader" className="sr-only">Actions</span>
    </div>
  );
}

/** A holding. Every number is the backend's; a null renders as an em dash, never a zero. */
export function HoldingRow({ holding }: { holding: PortfolioHolding }) {
  const pnlDir = directionOf(holding.pnlUsd);
  const tradeHref = `/markets/${encodeURIComponent(holding.mint)}`;
  return (
    <div role="row" className="border-b border-border-subtle last:border-0">
      {/* Desktop */}
      <div className={cn("hidden items-center gap-3 px-5 py-3.5 lg:grid", HOLDING_COLUMNS)}>
        <div role="cell" className="flex min-w-0 items-center gap-3">
          <AssetAvatar symbol={holding.symbol} imageUrl={holding.imageUrl} size="md" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-text-primary">{holding.name}</p>
            <p className="text-[12px] text-text-secondary">{holding.symbol}</p>
          </div>
        </div>
        <span role="cell" className="num text-right text-[14px] text-text-primary">{holding.quantity.toLocaleString("en-US", { maximumFractionDigits: 4, minimumFractionDigits: 2 })}</span>
        <span role="cell" className="text-right">
          <span className="num block text-[14px] text-text-primary">{formatUsdPrice(holding.priceUsd)}</span>
          <PriceChange value={holding.change24hPct} className="text-[12px]" />
        </span>
        <span role="cell" className="num text-right text-[14px] text-text-primary">{formatUsd(holding.valueUsd)}</span>
        <span role="cell" className="num text-right text-[14px] text-text-secondary">{formatUsdPrice(holding.averageEntryUsd)}</span>
        <span role="cell" className="text-right">
          <span className={cn("num block text-[14px] font-medium", DIRECTION_TEXT[pnlDir])}>{formatSignedUsd(holding.pnlUsd)}</span>
          <span className={cn("num block text-[12px]", DIRECTION_TEXT[pnlDir])}>{formatPct(holding.pnlPct)}</span>
        </span>
        <span role="cell" className="text-right"><Button href={tradeHref} size="sm" variant="secondary">Trade</Button></span>
      </div>

      {/* Mobile */}
      <Link href={tradeHref} className="flex items-center gap-3 px-1 py-3 lg:hidden">
        <AssetAvatar symbol={holding.symbol} imageUrl={holding.imageUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-text-primary">{holding.name}</p>
          <p className="num text-[12px] text-text-secondary">{holding.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })} {holding.symbol}</p>
        </div>
        <div className="text-right">
          <p className="num text-[15px] text-text-primary">{formatUsd(holding.valueUsd)}</p>
          <p className={cn("num text-[13px]", DIRECTION_TEXT[pnlDir])}>{formatPct(holding.pnlPct)}</p>
        </div>
      </Link>
    </div>
  );
}

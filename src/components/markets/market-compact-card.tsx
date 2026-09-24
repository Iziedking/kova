import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatUsdPrice } from "@/lib/format";
import type { MarketAsset } from "@/types/market";
import { AssetAvatar } from "./asset-avatar";
import { MiniPriceChart } from "./mini-price-chart";
import { PriceChange } from "./price-change";

/**
 * The Trending strip tile. Vertical on purpose: five of these have to fit in one
 * row beside the Home rail, and the same tile is the mobile carousel card.
 */
export function MarketCompactCard({ asset, className }: { asset: MarketAsset; className?: string }) {
  return (
    <Link
      href={`/markets/${encodeURIComponent(asset.mint)}`}
      aria-label={`${asset.symbol} ${formatUsdPrice(asset.priceUsd)}`}
      className={cn(
        "flex min-w-0 flex-col gap-2.5 rounded-card border border-border-subtle bg-surface-1 p-3 transition-colors duration-[120ms] hover:border-border-strong hover:bg-surface-2",
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <AssetAvatar symbol={asset.symbol} imageUrl={asset.imageUrl} size="md" />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold leading-5 text-text-primary">{asset.symbol}</p>
          <p className="num truncate text-[13px] leading-4 text-text-secondary">{formatUsdPrice(asset.priceUsd)}</p>
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <MiniPriceChart points={asset.sparkline} width={68} height={26} />
        <PriceChange value={asset.change24hPct} className="text-[13px]" />
      </div>
    </Link>
  );
}

export function MarketCompactCardSkeleton() {
  return (
    <div className="flex flex-col gap-2.5 rounded-card border border-border-subtle bg-surface-1 p-3" aria-hidden="true">
      <div className="flex items-center gap-2.5">
        <div className="skeleton h-10 w-10 rounded-[10px]" />
        <div className="space-y-1.5">
          <div className="skeleton h-3.5 w-12 rounded" />
          <div className="skeleton h-3 w-16 rounded" />
        </div>
      </div>
      <div className="flex items-end justify-between">
        <div className="skeleton h-6 w-16 rounded" />
        <div className="skeleton h-3.5 w-12 rounded" />
      </div>
    </div>
  );
}

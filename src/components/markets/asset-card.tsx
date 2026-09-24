import { Flame } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatAge, formatCompact, formatUsd, formatUsdPrice } from "@/lib/format";
import type { MarketAsset } from "@/types/market";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AssetAvatar } from "./asset-avatar";
import { MiniPriceChart } from "./mini-price-chart";
import { PriceChange } from "./price-change";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted">{label}</p>
      <p className="num truncate text-[13px] font-medium text-text-primary">{value}</p>
    </div>
  );
}

/**
 * Meme-stock asset card (blueprint 7.4). Handles every state a feed produces:
 * a missing image (tinted tile), a null price or change (an em dash, never a
 * zero), an unavailable market (muted, no CTA, with the reason) and stale data.
 */
export function AssetCard({
  asset,
  stale,
  className,
}: {
  asset: MarketAsset;
  stale?: boolean;
  className?: string;
}) {
  const unavailable = !asset.eligibility.prediction && !asset.eligibility.trading;
  return (
    <Link
      href={`/markets/${encodeURIComponent(asset.mint)}`}
      aria-label={`${asset.symbol}, ${asset.name}`}
      className={cn(
        "group flex min-w-0 flex-col rounded-card border border-border-subtle bg-surface-1 p-3.5 transition-colors duration-[120ms] hover:border-border-strong hover:bg-surface-2",
        unavailable && "opacity-70",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <AssetAvatar symbol={asset.symbol} imageUrl={asset.imageUrl} size="lg" className={unavailable ? "grayscale" : undefined} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold text-text-primary">${asset.symbol}</p>
          <p className="truncate text-[12px] text-text-secondary">{asset.underlyingTicker ? `${asset.name} · ${asset.underlyingTicker}` : asset.name}</p>
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        <div>
          <p className="num text-[19px] font-semibold leading-6 text-text-primary">{formatUsdPrice(asset.priceUsd)}</p>
          <PriceChange value={asset.change24hPct} className="text-[13px]" />
        </div>
        <MiniPriceChart points={asset.sparkline} width={88} height={34} fill />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border-subtle pt-2.5">
        <Stat label="Vol 24h" value={asset.volume24hUsd === null ? "—" : `$${formatCompact(asset.volume24hUsd)}`} />
        <Stat label="Liquidity" value={asset.liquidityUsd === null ? "—" : formatUsd(asset.liquidityUsd, { compact: true })} />
        <Stat label="Age" value={formatAge(asset.ageSeconds)} />
      </div>

      <div className="mt-2.5 flex min-h-6 items-center gap-2">
        {unavailable ? (
          <Badge tone="warning">{asset.eligibility.reason ?? "Unavailable"}</Badge>
        ) : asset.kovaActivityCount ? (
          <span className="inline-flex items-center gap-1 text-[12px] text-text-secondary">
            <Flame size={13} className="text-warning" aria-hidden="true" />
            {asset.kovaActivityCount} recent Kova matches
          </span>
        ) : null}
        {stale ? <span className="ml-auto text-[11px] text-text-muted">stale</span> : null}
      </div>
    </Link>
  );
}

export function AssetCardSkeleton() {
  return (
    <div className="rounded-card border border-border-subtle bg-surface-1 p-3.5" aria-hidden="true">
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-3.5 w-14" />
        </div>
        <Skeleton className="h-9 w-[88px]" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border-subtle pt-2.5">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-8 w-full" />
        ))}
      </div>
      <Skeleton className="mt-2.5 h-5 w-32" />
    </div>
  );
}

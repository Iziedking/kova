"use client";

import { ExternalLink, Share2, Star } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatCompact, formatUsd, formatUsdPrice } from "@/lib/format";
import { useRequireAuth } from "@/features/auth/use-require-auth";
import { useWatchlist } from "@/features/markets/use-watchlist";
import { AssetAvatar } from "@/components/markets/asset-avatar";
import { PriceChange } from "@/components/markets/price-change";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { MarketAsset } from "@/types/market";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 sm:px-4 sm:first:pl-0">
      <dt className="text-[12px] text-text-secondary">{label}</dt>
      <dd className="num mt-0.5 text-[15px] font-semibold text-text-primary">{value}</dd>
    </div>
  );
}

/**
 * The asset header above the chart (blueprint 16): identity, price and move, the
 * 24h essentials, and Watch / Share / Details. Holder tables, developer metadata
 * and risk metrics deliberately live behind the market page, not above the fold.
 */
export function AssetHeader({ asset, compact = false }: { asset: MarketAsset; compact?: boolean }) {
  const requireAuth = useRequireAuth();
  const { watching, toggle } = useWatchlist();
  const saved = watching(asset.mint);

  function onWatch() {
    requireAuth(() => {
      const nowWatching = toggle(asset.mint);
      toast.info(nowWatching ? `Watching $${asset.symbol} on this device` : `Stopped watching $${asset.symbol}`);
    });
  }

  async function onShare() {
    const url = `${window.location.origin}/markets/${encodeURIComponent(asset.mint)}`;
    try {
      if (navigator.share) await navigator.share({ title: `${asset.symbol} on Kova`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Market link copied");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) toast.error("Couldn't share this market.");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start gap-3">
        <AssetAvatar symbol={asset.symbol} imageUrl={asset.imageUrl} size={compact ? "lg" : "xl"} />
        <div className="min-w-0 flex-1 basis-40">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 className={cn("font-display font-bold leading-none text-text-primary", compact ? "text-[20px]" : "text-[28px]")}>{asset.symbol}</h2>
            {asset.source === "clawpump / pump.fun" ? <Badge tone="accent">Meme Stock</Badge> : asset.category === "meme-stock" ? <Badge tone="accent">Meme Stock</Badge> : null}
            {asset.narrative ? <Badge tone="outline">{asset.narrative}</Badge> : null}
          </div>
          <p className="mt-1 truncate text-[14px] text-text-secondary">{asset.name}</p>
        </div>
        {!compact ? (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" iconLeft={<Star size={15} className={saved ? "fill-current text-warning" : undefined} />} onClick={onWatch} aria-pressed={saved}>
              {saved ? "Watching" : "Watch"}
            </Button>
            <Button variant="secondary" size="sm" aria-label="Share market" onClick={() => void onShare()} iconLeft={<Share2 size={15} />} />
            <Link href={`/markets/${encodeURIComponent(asset.mint)}`} aria-label="Market details" className="grid h-9 w-9 place-items-center rounded-button border border-border-strong text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary">
              <ExternalLink size={15} aria-hidden="true" />
            </Link>
          </div>
        ) : null}
      </div>

      <div className={cn("mt-4 flex flex-wrap items-end gap-x-8 gap-y-3", compact && "mt-3")}>
        <div className="flex items-baseline gap-3">
          <span className={cn("num font-semibold leading-none text-text-primary", compact ? "text-[26px]" : "text-[36px]")}>{formatUsdPrice(asset.priceUsd)}</span>
          <PriceChange value={asset.change24hPct} className={compact ? "text-[15px]" : "text-[18px]"} />
        </div>
        {!compact ? (
          <dl className="grid w-full grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:w-auto sm:divide-x sm:divide-border-subtle">
            <Stat label="24h High" value={formatUsdPrice(asset.high24hUsd ?? null)} />
            <Stat label="24h Low" value={formatUsdPrice(asset.low24hUsd ?? null)} />
            <Stat label="Volume" value={asset.volume24hUsd == null ? "—" : formatCompact(asset.volume24hUsd)} />
            <Stat label="Market Cap" value={asset.marketCapUsd == null ? "—" : formatUsd(asset.marketCapUsd, { compact: true })} />
          </dl>
        ) : null}
      </div>
    </div>
  );
}

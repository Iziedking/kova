"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { formatUsdPrice } from "@/lib/format";
import { useResource } from "@/hooks/use-resource";
import { AssetAvatar } from "@/components/markets/asset-avatar";
import { MiniPriceChart } from "@/components/markets/mini-price-chart";
import { PriceChange } from "@/components/markets/price-change";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ResourceView } from "@/components/ui/states";
import type { MarketCategory } from "@/types/market";

const FILTERS: Array<{ value: MarketCategory | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "meme-stock", label: "Meme Stocks" },
  { value: "index", label: "Indexes" },
];

/**
 * The trading match's market rail (blueprint 15): search, eligible markets only,
 * one row per market - symbol, trend, price, move. No liquidity or volume
 * columns here. The active row carries a violet wash and a 2px left accent.
 */
export function MarketRail({
  activeMint,
  onSelect,
  eligibleMints,
  className,
}: {
  activeMint: string;
  onSelect: (mint: string) => void;
  eligibleMints: readonly string[];
  className?: string;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<MarketCategory | "all">("all");
  const { state, refetch } = useResource((s) => s.markets.list({ search: search.trim() || undefined, category, tradableOnly: true }), [search, category], { refreshMs: 10_000 });
  const eligible = useMemo(() => new Set(eligibleMints), [eligibleMints]);

  return (
    <div className={cn("flex min-h-0 flex-col rounded-panel border border-border-subtle bg-surface-1 p-4", className)}>
      <h2 className="font-display text-[20px] font-bold text-text-primary">Markets</h2>
      <p className="mt-0.5 text-[13px] text-text-secondary">Trade meme stocks. Compete in real time.</p>

      <div className="mt-3 flex h-11 items-center gap-2.5 rounded-input border border-border-strong bg-surface-2 px-3 focus-within:border-accent">
        <Search size={16} className="text-text-muted" aria-hidden="true" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search ticker or contract address"
          aria-label="Search ticker or contract address"
          className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-text-primary outline-none placeholder:text-text-muted"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Market filter">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            aria-pressed={category === filter.value}
            onClick={() => setCategory(filter.value)}
            className={cn(
              "h-8 rounded-lg border px-3 text-[13px] transition-colors",
              category === filter.value ? "border-accent-line bg-accent-soft text-[#d7c6ff]" : "border-border-subtle text-text-secondary hover:text-text-primary",
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between px-2 text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted">
        <span>Symbol</span>
        <span>Price / 24h</span>
      </div>

      <div className="mt-1 min-h-0 flex-1 overflow-y-auto">
        <ResourceView
          state={state}
          compact
          onRetry={refetch}
          errorTitle="Markets couldn't load"
          pendingTitle="Markets aren't connected yet"
          loading={
            <div className="space-y-2" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((key) => (
                <Skeleton key={key} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          }
          isEmpty={(list) => list.assets.filter((asset) => eligible.has(asset.mint)).length === 0}
          empty={<EmptyState compact title="No eligible markets match" body="Clear the search or filter." />}
        >
          {(list) => (
            <ul>
              {list.assets
                .filter((asset) => eligible.has(asset.mint))
                .map((asset) => {
                  const active = asset.mint === activeMint;
                  return (
                    <li key={asset.mint}>
                      <button
                        type="button"
                        onClick={() => onSelect(asset.mint)}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "relative flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors",
                          active ? "bg-accent-soft" : "hover:bg-surface-2",
                        )}
                      >
                        {active ? <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-accent" /> : null}
                        <AssetAvatar symbol={asset.symbol} imageUrl={asset.imageUrl} size="md" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-semibold text-text-primary">{asset.symbol}</span>
                          <MiniPriceChart points={asset.sparkline} width={54} height={16} />
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="num block text-[13px] text-text-primary">{formatUsdPrice(asset.priceUsd)}</span>
                          <PriceChange value={asset.change24hPct} className="text-[12px]" />
                        </span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
        </ResourceView>
      </div>
    </div>
  );
}

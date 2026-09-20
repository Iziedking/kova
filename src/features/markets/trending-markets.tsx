"use client";

import { BarChart3 } from "lucide-react";
import { useResource } from "@/hooks/use-resource";
import { SectionHeader } from "@/components/ui/section";
import { EmptyState, ResourceView } from "@/components/ui/states";
import { MarketCompactCard, MarketCompactCardSkeleton } from "@/components/markets/market-compact-card";

/**
 * Trending Markets: broad market context before the meme-stock feed
 * (blueprint section 6). Five tiles in a row on desktop, a swipe strip on mobile.
 */
export function TrendingMarkets() {
  const { state, refetch } = useResource((s) => s.markets.list({ sort: "trending", limit: 5 }), []);

  return (
    <section aria-labelledby="trending-title">
      <SectionHeader
        title="Trending Markets"
        subtitle="Popular right now on Kova."
        icon={<BarChart3 size={20} />}
        action={{ label: "View all markets", href: "/markets" }}
      />
      <span id="trending-title" className="sr-only">Trending Markets</span>
      <ResourceView
        state={state}
        onRetry={refetch}
        errorTitle="Trending markets couldn't load"
        pendingTitle="Market data isn't connected yet"
        loading={
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[0, 1, 2, 3, 4].map((key) => (
              <MarketCompactCardSkeleton key={key} />
            ))}
          </div>
        }
        isEmpty={(list) => list.assets.length === 0}
        empty={<EmptyState compact title="No markets to show yet" body="Trending markets will appear here." />}
      >
        {(list) => (
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-5">
            {list.assets.slice(0, 5).map((asset) => (
              <MarketCompactCard key={asset.mint} asset={asset} className="w-[148px] shrink-0 snap-start sm:w-auto" />
            ))}
          </div>
        )}
      </ResourceView>
    </section>
  );
}

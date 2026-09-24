"use client";

import { Flame } from "lucide-react";
import { formatTimeAgo } from "@/lib/format";
import { useResource } from "@/hooks/use-resource";
import { SectionHeader } from "@/components/ui/section";
import { EmptyState, ResourceView } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { AssetCard, AssetCardSkeleton } from "@/components/markets/asset-card";
import { PompSourceBadge } from "@/components/markets/pomp-source-badge";

/**
 * Meme Stocks - Powered by ClawPump / pump.fun (blueprint section 7).
 *
 * Consumes the normalized `MarketAsset` feed, so a newly returned eligible asset
 * appears with no layout change. Loading mirrors the card geometry; empty never
 * substitutes fake assets; an error keeps the last data on screen and says how
 * old it is. 4 columns at 1440+ (8 assets), 3 at laptop (6), a carousel on mobile.
 */
export function MemeStocksSection() {
  const { state, refetch } = useResource((s) => s.markets.memeStocks({ sort: "trending", limit: 8 }), [], { refreshMs: 60_000 });

  return (
    <section aria-labelledby="meme-stocks-title">
      <SectionHeader
        title="Meme Stocks"
        subtitle="Community driven. Volatile. Entertainment only."
        icon={<Flame size={20} className="text-[#ff7a45]" />}
        badge={<PompSourceBadge />}
        action={{ label: "View all", href: "/markets?source=pomp" }}
      />
      <span id="meme-stocks-title" className="sr-only">Meme Stocks</span>
      <ResourceView
        state={state}
        onRetry={refetch}
        errorTitle="Meme Stocks couldn't refresh"
        pendingTitle="Meme Stocks isn't connected yet"
        loading={
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {[0, 1, 2, 3].map((key) => (
              <AssetCardSkeleton key={key} />
            ))}
          </div>
        }
        isEmpty={(list) => list.assets.length === 0}
        empty={
          <EmptyState
            title="No new ClawPump / pump.fun meme stocks are available right now."
            body="Check back soon or browse all markets."
            action={<Button href="/markets" size="sm" variant="secondary">Browse markets</Button>}
          />
        }
      >
        {(list) => (
          <>
            <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-3 2xl:grid-cols-4">
              {list.assets.slice(0, 8).map((asset, index) => (
                <AssetCard
                  key={asset.mint}
                  asset={asset}
                  stale={list.freshness.stale}
                  className={
                    index >= 6
                      ? "w-[82%] shrink-0 snap-start sm:hidden sm:w-auto 2xl:flex"
                      : "w-[82%] shrink-0 snap-start sm:w-auto"
                  }
                />
              ))}
            </div>
            {list.freshness.stale ? (
              <p className="mt-2 text-[12px] text-text-muted">Updated {formatTimeAgo(list.freshness.updatedAt)} · data may be stale</p>
            ) : null}
          </>
        )}
      </ResourceView>
    </section>
  );
}

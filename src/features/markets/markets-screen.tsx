"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatTimeAgo } from "@/lib/format";
import { useResource } from "@/hooks/use-resource";
import { MarketRow, MarketRowSkeleton, MarketTableHeader } from "@/components/markets/market-row";
import { PompSourceBadge } from "@/components/markets/pomp-source-badge";
import { PageContainer } from "@/components/shell/page-container";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { ResponsiveOverlay } from "@/components/ui/overlay";
import { EmptyState, ResourceView } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import type { MarketCategory, MarketSort } from "@/types/market";

const SORTS = [
  { value: "trending", label: "Trending" },
  { value: "new", label: "New" },
  { value: "movers", label: "Movers" },
  { value: "volume", label: "Most Traded" },
] as const satisfies ReadonlyArray<{ value: MarketSort; label: string }>;

type SortValue = (typeof SORTS)[number]["value"];

function isSort(value: string | null): value is SortValue {
  return SORTS.some((sort) => sort.value === value);
}

/**
 * Markets: discovery without becoming CoinMarketCap (blueprint 24). Filters live
 * in the URL (`q`, `sort`, `source`, `category`) so a view is shareable and
 * `Home -> View all` can land on the ClawPump / pump.fun feed.
 */
export function MarketsScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const q = params.get("q") ?? "";
  const sortParam = params.get("sort");
  const sort: SortValue = isSort(sortParam) ? sortParam : "trending";
  const source = params.get("source") === "pomp" ? "pomp" : "all";
  const category = (params.get("category") as MarketCategory | "all" | null) ?? "all";

  const [draft, setDraft] = useState(q);
  const [filtersOpen, setFiltersOpen] = useState(false);

  function update(next: Record<string, string | null>) {
    const search = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "" || value === "all") search.delete(key);
      else search.set(key, value);
    }
    const query = search.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  // Debounce typing into the URL.
  useEffect(() => {
    if (draft === q) return;
    const timer = setTimeout(() => update({ q: draft.trim() }), 250);
    return () => clearTimeout(timer);
    // `update` only closes over stable router/params reads for this write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const { state, refetch } = useResource(
    (s) => {
      const query = { search: q || undefined, sort, category };
      return source === "pomp" ? s.markets.memeStocks(query) : s.markets.list(query);
    },
    [q, sort, source, category],
    { refreshMs: 30_000 },
  );

  const activeFilters = (source === "pomp" ? 1 : 0) + (category !== "all" ? 1 : 0);

  return (
    <PageContainer as="main" className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[34px] font-bold leading-tight tracking-[-0.02em] text-text-primary md:text-[40px]">Markets</h1>
            {source === "pomp" ? <PompSourceBadge /> : null}
          </div>
          <p className="mt-1 text-[16px] text-text-secondary">Meme stocks people are playing right now.</p>
        </div>
        <div className="flex w-full items-center gap-2.5 md:w-auto">
          <div className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-input border border-border-strong bg-surface-1 px-3.5 focus-within:border-accent md:w-[380px] md:flex-none">
            <Search size={17} className="shrink-0 text-text-muted" aria-hidden="true" />
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ticker, name or contract address"
              aria-label="Search markets by ticker, name or contract address"
              className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-text-primary outline-none placeholder:text-text-muted"
            />
            {draft ? (
              <button type="button" aria-label="Clear search" onClick={() => { setDraft(""); update({ q: null }); }} className="text-text-muted hover:text-text-primary">
                <X size={16} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <Button variant="secondary" iconLeft={<SlidersHorizontal size={16} />} onClick={() => setFiltersOpen(true)}>
            Filters{activeFilters ? ` · ${activeFilters}` : ""}
          </Button>
        </div>
      </header>

      <Tabs
        label="Sort markets"
        variant="underline"
        value={sort}
        onValueChange={(next) => update({ sort: next === "trending" ? null : next })}
        items={SORTS.map((entry) => ({ value: entry.value, label: entry.label }))}
      />

      <section aria-label="Markets" className="rounded-panel border border-border-subtle bg-surface-1 px-3 py-3 lg:px-0 lg:pt-4">
        <div role="table" aria-label="Markets">
          <MarketTableHeader />
          <div role="rowgroup">
            <ResourceView
              state={state}
              onRetry={refetch}
              errorTitle="Markets couldn't refresh"
              pendingTitle="Market data isn't connected yet"
              className="m-3"
              loading={
                <div aria-hidden="true">
                  {Array.from({ length: 8 }, (_, key) => (
                    <MarketRowSkeleton key={key} />
                  ))}
                </div>
              }
              isEmpty={(list) => list.assets.length === 0}
              empty={
                <div className="p-3">
                  <EmptyState
                    title={q ? `No markets match “${q}”.` : source === "pomp" ? "No ClawPump / pump.fun meme stocks right now." : "No markets to show."}
                    body={q || activeFilters ? "Try a different search or clear your filters." : "Check back soon."}
                    action={
                      q || activeFilters ? (
                        <Button size="sm" variant="secondary" onClick={() => { setDraft(""); update({ q: null, source: null, category: null }); }}>
                          Clear filters
                        </Button>
                      ) : undefined
                    }
                  />
                </div>
              }
            >
              {(list) => (
                <>
                  {list.assets.map((asset) => (
                    <MarketRow key={asset.mint} asset={asset} />
                  ))}
                  {list.freshness.stale ? (
                    <p className="px-4 pt-3 text-[12px] text-text-muted">Updated {formatTimeAgo(list.freshness.updatedAt)} · data may be stale</p>
                  ) : null}
                </>
              )}
            </ResourceView>
          </div>
        </div>
      </section>

      <ResponsiveOverlay
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="Filters"
        footer={
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="secondary" onClick={() => { update({ source: null, category: null }); setFiltersOpen(false); }}>Clear</Button>
            <Button onClick={() => setFiltersOpen(false)}>Show results</Button>
          </div>
        }
      >
        <div className="space-y-5">
          <ChoiceGroup
            label="Source"
            value={source}
            onChange={(next) => update({ source: next === "pomp" ? "pomp" : null })}
            choices={[
              { value: "all", label: "All markets" },
              { value: "pomp", label: "ClawPump / pump.fun" },
            ]}
          />
          <ChoiceGroup
            label="Type"
            value={category}
            onChange={(next) => update({ category: next })}
            columns={2}
            choices={[
              { value: "all", label: "All" },
              { value: "meme-stock", label: "Meme stocks" },
              { value: "index", label: "Indexes" },
              { value: "other", label: "Other" },
            ]}
          />
        </div>
      </ResponsiveOverlay>
    </PageContainer>
  );
}

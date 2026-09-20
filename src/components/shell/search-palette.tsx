"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { Search, Table2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { formatUsdPrice } from "@/lib/format";
import { useResource } from "@/hooks/use-resource";
import { AssetAvatar } from "@/components/markets/asset-avatar";
import { PriceChange } from "@/components/markets/price-change";
import { PlayerAvatar } from "@/components/social/player-avatar";

interface ResultItem {
  id: string;
  group: "Markets" | "Players" | "Tables";
  label: string;
  meta?: React.ReactNode;
  href: string;
  lead: React.ReactNode;
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * Global search: markets, players and live tables (blueprint 30). Full-screen
 * on mobile, a top-anchored palette on desktop, with arrow-key navigation.
 * Groups whose backend isn't connected simply don't appear; the palette never
 * invents results.
 */
export function SearchPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const debounced = useDebounced(query.trim(), 180);

  const markets = useResource((s) => s.markets.list({ search: debounced || undefined, limit: 5 }), [debounced], { enabled: open });
  const players = useResource((s) => s.social.leaderboard("overall"), [], { enabled: open });
  const tables = useResource((s) => s.competitions.listTables({ limit: 20 }), [], { enabled: open });

  const items = useMemo<ResultItem[]>(() => {
    const needle = debounced.toLowerCase();
    const out: ResultItem[] = [];

    if (markets.state.status === "ready") {
      for (const asset of markets.state.data.assets.slice(0, 5)) {
        out.push({
          id: `m-${asset.mint}`,
          group: "Markets",
          label: asset.symbol,
          href: `/markets/${encodeURIComponent(asset.mint)}`,
          lead: <AssetAvatar symbol={asset.symbol} imageUrl={asset.imageUrl} size="sm" />,
          meta: (
            <span className="flex items-center gap-2 text-[13px]">
              <span className="num text-text-secondary">{formatUsdPrice(asset.priceUsd)}</span>
              <PriceChange value={asset.change24hPct} />
            </span>
          ),
        });
      }
    }
    if (players.state.status === "ready") {
      const matched = players.state.data.filter((row) => !needle || row.username.toLowerCase().includes(needle)).slice(0, 4);
      for (const row of matched) {
        out.push({
          id: `p-${row.username}`,
          group: "Players",
          label: `@${row.username}`,
          href: `/profile/${encodeURIComponent(row.username)}`,
          lead: <PlayerAvatar username={row.username} src={row.avatarUrl} size="sm" />,
          meta: row.rating ? <span className="num text-[13px] text-text-secondary">{row.rating}</span> : undefined,
        });
      }
    }
    if (tables.state.status === "ready") {
      const matched = tables.state.data.filter((table) => !needle || table.name.toLowerCase().includes(needle)).slice(0, 4);
      for (const table of matched) {
        out.push({
          id: `t-${table.id}`,
          group: "Tables",
          label: table.name,
          href: `/tables/${encodeURIComponent(table.id)}`,
          lead: <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-3 text-text-secondary"><Table2 size={16} aria-hidden="true" /></span>,
          meta: <span className="text-[13px] capitalize text-text-secondary">{table.mode === "prediction" ? "Predict" : "Trade"} · {table.status}</span>,
        });
      }
    }
    return out;
  }, [debounced, markets.state, players.state, tables.state]);

  const loading = [markets, players, tables].every((r) => r.state.status === "loading");

  function close() {
    onOpenChange(false);
    setQuery("");
    setActive(0);
  }

  function go(item: ResultItem | undefined) {
    if (!item) return;
    close();
    router.push(item.href);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, Math.max(items.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(items[active]);
    }
  }

  const groups = (["Markets", "Players", "Tables"] as const)
    .map((group) => ({ group, entries: items.map((item, index) => ({ item, index })).filter(({ item }) => item.group === group) }))
    .filter(({ entries }) => entries.length > 0);

  return (
    <RadixDialog.Root open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] animate-fade-in" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className={cn(
            "fixed z-50 flex flex-col bg-surface-1 outline-none animate-rise-in",
            "inset-0 md:inset-x-auto md:left-1/2 md:top-[12vh] md:max-h-[70vh] md:w-[640px] md:-translate-x-1/2 md:rounded-sheet md:border md:border-border-strong md:shadow-modal",
          )}
        >
          <RadixDialog.Title className="sr-only">Search Kova</RadixDialog.Title>
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle px-4">
            <Search size={18} className="text-text-muted" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search markets, users, or tables…"
              aria-label="Search markets, users, or tables"
              className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-text-primary outline-none placeholder:text-text-muted"
            />
            <RadixDialog.Close className="rounded-md border border-border-strong px-2 py-1 text-[12px] text-text-secondary hover:bg-surface-3">Esc</RadixDialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2" role="listbox" aria-label="Results">
            {loading ? (
              <p className="px-3 py-6 text-[14px] text-text-secondary">Searching…</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-6 text-[14px] text-text-secondary">
                {debounced ? `No results for “${debounced}”.` : "Start typing to search markets, players and live tables."}
              </p>
            ) : (
              groups.map(({ group, entries }) => (
                <div key={group} className="mb-2">
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">{group}</p>
                  {entries.map(({ item, index }) => (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={index === active}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => go(item)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                        index === active ? "bg-surface-3" : "hover:bg-surface-2",
                      )}
                    >
                      {item.lead}
                      <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-text-primary">{item.label}</span>
                      {item.meta}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

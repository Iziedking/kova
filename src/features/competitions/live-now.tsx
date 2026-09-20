"use client";

import { useResource } from "@/hooks/use-resource";
import { SectionHeader } from "@/components/ui/section";
import { EmptyState, ResourceView } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { TableCard, TableCardSkeleton } from "@/components/play/table-card";
import type { PublicTableSummary } from "@/types/competition";

const RANK: Record<PublicTableSummary["status"], number> = { active: 0, settling: 1, open: 2, waiting: 3, settled: 4, cancelled: 5 };

/**
 * Live Now: proof that people are playing right now (blueprint 5.2).
 * Three cards on desktop, two on tablet, a snap carousel on mobile. A failing
 * feed shows an inline retry here and nowhere else.
 */
export function LiveNow({ limit = 3, title = "Live Now" }: { limit?: number; title?: string }) {
  const { state, refetch } = useResource((s) => s.competitions.listTables({ limit: 12 }), [], { refreshMs: 20_000 });

  return (
    <section aria-labelledby="live-now-title">
      <SectionHeader
        title={title}
        subtitle="Join a table, play in real time."
        icon={<span className="block h-2.5 w-2.5 rounded-full bg-success animate-pulse-dot" />}
        action={{ label: "View all tables", href: "/play" }}
      />
      <span id="live-now-title" className="sr-only">{title}</span>
      <ResourceView
        state={state}
        onRetry={refetch}
        errorTitle="Live tables couldn't load"
        pendingTitle="Live tables aren't connected yet"
        loading={
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((key) => (
              <TableCardSkeleton key={key} />
            ))}
          </div>
        }
        isEmpty={(tables) => tables.length === 0}
        empty={
          <EmptyState
            title="No public tables are open right now."
            body="Create one or challenge someone directly."
            action={
              <>
                <Button href="/play?intent=create" size="sm">Create table</Button>
                <Button href="/leaderboard" size="sm" variant="secondary">Challenge</Button>
              </>
            }
          />
        }
      >
        {(tables) => {
          const sorted = [...tables].sort((a, b) => RANK[a.status] - RANK[b.status]).slice(0, limit);
          return (
            <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 scrollbar-none md:mx-0 md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:px-0 xl:grid-cols-3">
              {sorted.map((table) => (
                <TableCard key={table.id} table={table} className="w-[86%] shrink-0 snap-start sm:w-[72%] md:w-auto" />
              ))}
            </div>
          );
        }}
      </ResourceView>
    </section>
  );
}

"use client";

import { useResource } from "@/hooks/use-resource";
import { SectionHeader } from "@/components/ui/section";
import { EmptyState, ResourceView } from "@/components/ui/states";
import { RecentShowdownRow } from "@/components/social/recent-showdown-row";
import { ListSkeleton, RailPanel } from "./hot-players";

/** Recent results: what makes the product feel populated and social. */
export function RecentShowdowns({ limit = 5 }: { limit?: number }) {
  const { state, refetch } = useResource((s) => s.social.recentShowdowns(), [], { refreshMs: 60_000 });

  return (
    <RailPanel>
      <SectionHeader title="Recent Showdowns" action={{ label: "View all", href: "/leaderboard" }} className="mb-2" />
      <ResourceView
        state={state}
        onRetry={refetch}
        compact
        errorTitle="Showdowns couldn't load"
        pendingTitle="Results aren't connected yet"
        loading={<ListSkeleton rows={limit} />}
        isEmpty={(rows) => rows.length === 0}
        empty={<EmptyState compact title="No showdowns yet" body="Finished matches will show up here." />}
      >
        {(rows) => (
          <div className="divide-y divide-border-subtle">
            {rows.slice(0, limit).map((showdown) => (
              <RecentShowdownRow key={showdown.id} showdown={showdown} />
            ))}
          </div>
        )}
      </ResourceView>
    </RailPanel>
  );
}

"use client";

import { useResource } from "@/hooks/use-resource";
import { useChallenge } from "@/features/competitions/use-challenge";
import { SectionHeader } from "@/components/ui/section";
import { EmptyState, ResourceView } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/skeleton";
import { PlayerRow } from "@/components/social/player-row";

/** A bordered rail panel, shared by Hot Players and Recent Showdowns. */
export function RailPanel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-panel border border-border-subtle bg-surface-1 p-4 md:p-5">{children}</div>;
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border-subtle" aria-hidden="true">
      {Array.from({ length: rows }, (_, key) => (
        <div key={key} className="flex items-center gap-3 py-3">
          <Skeleton className="h-7 w-7 rounded-full" />
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}

/** Who is winning right now, each with a one-tap Challenge. */
export function HotPlayers({ limit = 5 }: { limit?: number }) {
  const { state, refetch } = useResource((s) => s.social.hotPlayers(), [], { refreshMs: 60_000 });
  const { challenge, sheet } = useChallenge();

  return (
    <RailPanel>
      <SectionHeader title="Hot Players" action={{ label: "View all", href: "/leaderboard" }} className="mb-2" />
      <ResourceView
        state={state}
        onRetry={refetch}
        compact
        errorTitle="Hot Players couldn't load"
        pendingTitle="Rankings aren't connected yet"
        loading={<ListSkeleton rows={limit} />}
        isEmpty={(players) => players.length === 0}
        empty={<EmptyState compact title="No ranked players yet" body="Win a match to get on the board." />}
      >
        {(players) => (
          <div className="divide-y divide-border-subtle">
            {players.slice(0, limit).map((player) => (
              <PlayerRow key={player.username} player={player} onChallenge={challenge} />
            ))}
          </div>
        )}
      </ResourceView>
      {sheet}
    </RailPanel>
  );
}

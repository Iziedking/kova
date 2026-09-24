"use client";

import { Swords } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatPct } from "@/lib/format";
import { useViewer } from "@/features/auth/viewer";
import { useChallenge } from "@/features/competitions/use-challenge";
import { useResource } from "@/hooks/use-resource";
import { PriceChange } from "@/components/markets/price-change";
import { PageContainer } from "@/components/shell/page-container";
import { PlayerAvatar } from "@/components/social/player-avatar";
import { StreakBadge } from "@/components/social/streak-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ResourceView } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import type { LeaderboardRow, LeaderboardScope } from "@/types/social";

const COLUMNS = "grid-cols-[48px_minmax(180px,2fr)_80px_80px_80px_120px_120px_110px]";

function RankCell({ rank }: { rank: number }) {
  return (
    <span className={cn("num grid h-8 w-8 place-items-center rounded-full text-[13px] font-semibold", rank <= 3 ? "bg-accent-soft text-[#c3a9ff] ring-1 ring-inset ring-accent-line" : "text-text-secondary")}>
      {rank}
    </span>
  );
}

function ChallengeButton({ username, self, onChallenge }: { username: string; self: boolean; onChallenge: (username: string) => void }) {
  if (self) return <span className="text-[12px] text-text-muted">You</span>;
  return (
    <button
      type="button"
      onClick={() => onChallenge(username)}
      aria-label={`Challenge ${username}`}
      className="inline-flex h-9 items-center gap-1.5 rounded-button border border-border-strong px-3 text-[13px] font-semibold text-text-primary transition-colors hover:border-accent-line hover:bg-accent-soft"
    >
      <Swords size={14} aria-hidden="true" /> Challenge
    </button>
  );
}

function modeStat(row: LeaderboardRow, scope: LeaderboardScope) {
  if (row.modeStatPct === null) return "—";
  return scope === "prediction" ? formatPct(row.modeStatPct, { digits: 0, signed: false }) : <PriceChange value={row.modeStatPct} />;
}

/**
 * Leaderboard: Overall / Predict / Trade (blueprint 26). A table on desktop,
 * ranked rows on mobile. Anyone can read it; Challenge asks a guest to sign in
 * and brings them straight back to the sheet.
 */
export function LeaderboardScreen() {
  const viewer = useViewer();
  const [scope, setScope] = useState<LeaderboardScope>("overall");
  const { challenge, sheet } = useChallenge();
  const { state, refetch } = useResource((s) => s.social.leaderboard(scope), [scope], { refreshMs: 60_000 });
  const me = viewer.identity?.username.toLowerCase() ?? null;

  return (
    <PageContainer as="main" className="space-y-6">
      <header>
        <h1 className="font-display text-[34px] font-bold leading-tight tracking-[-0.02em] text-text-primary md:text-[40px]">Leaderboard</h1>
        <p className="mt-1 text-[16px] text-text-secondary">The best records on Kova. Ranked by rating.</p>
      </header>

      <Tabs
        label="Leaderboard scope"
        value={scope}
        onValueChange={setScope}
        items={[
          { value: "overall", label: "Overall" },
          { value: "prediction", label: "Predict" },
          { value: "trading", label: "Trade" },
        ]}
      />

      <section aria-label="Rankings" className="rounded-panel border border-border-subtle bg-surface-1 px-3 py-3 lg:px-0 lg:pt-4">
        <ResourceView
          state={state}
          onRetry={refetch}
          className="m-3"
          errorTitle="The leaderboard couldn't load"
          pendingTitle="Rankings aren't connected yet"
          loading={
            <div className="space-y-2 p-2" aria-hidden="true">
              {Array.from({ length: 8 }, (_, key) => (
                <Skeleton key={key} className="h-14 w-full" />
              ))}
            </div>
          }
          isEmpty={(rows) => rows.length === 0}
          empty={<div className="p-3"><EmptyState title="No ranked players yet" body="Finish a match to get on the board." /></div>}
        >
          {(rows) => (
            <>
              {/* Desktop table */}
              <div role="table" aria-label="Leaderboard" className="hidden lg:block">
                <div role="row" className={cn("grid items-center gap-4 border-b border-border-subtle px-5 pb-3 text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted", COLUMNS)}>
                  <span role="columnheader">#</span>
                  <span role="columnheader">Player</span>
                  <span role="columnheader" className="text-right">Rating</span>
                  <span role="columnheader" className="text-right">Matches</span>
                  <span role="columnheader" className="text-right">Win rate</span>
                  <span role="columnheader" className="text-right">{rows[0]?.modeStatLabel ?? "Avg PnL"}</span>
                  <span role="columnheader">Streak</span>
                  <span role="columnheader" className="sr-only">Challenge</span>
                </div>
                {rows.map((row) => (
                  <div key={row.username} role="row" className={cn("grid items-center gap-4 border-b border-border-subtle px-5 py-3 last:border-0", COLUMNS, me === row.username.toLowerCase() && "bg-accent-soft/40")}>
                    <span role="cell"><RankCell rank={row.rank} /></span>
                    <Link role="cell" href={`/profile/${encodeURIComponent(row.username)}`} className="flex min-w-0 items-center gap-3">
                      <PlayerAvatar username={row.username} src={row.avatarUrl} size="md" verified={row.verified} />
                      <span className="truncate text-[15px] font-semibold text-text-primary">{row.username}</span>
                    </Link>
                    <span role="cell" className="num text-right text-[14px] text-text-primary">{row.rating ?? "—"}</span>
                    <span role="cell" className="num text-right text-[14px] text-text-primary">{row.matches}</span>
                    <span role="cell" className="num text-right text-[14px] text-text-primary">{row.winRatePct == null ? "—" : `${row.winRatePct}%`}</span>
                    <span role="cell" className="num text-right text-[14px]">{modeStat(row, scope)}</span>
                    <span role="cell"><StreakBadge streak={row.streak} /></span>
                    <span role="cell" className="text-right"><ChallengeButton username={row.username} self={me === row.username.toLowerCase()} onChallenge={challenge} /></span>
                  </div>
                ))}
              </div>

              {/* Mobile / tablet rows */}
              <ol className="divide-y divide-border-subtle lg:hidden">
                {rows.map((row) => (
                  <li key={row.username} className={cn("flex items-center gap-3 px-1 py-3", me === row.username.toLowerCase() && "rounded-lg bg-accent-soft/40")}>
                    <RankCell rank={row.rank} />
                    <Link href={`/profile/${encodeURIComponent(row.username)}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <PlayerAvatar username={row.username} src={row.avatarUrl} size="md" verified={row.verified} />
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold text-text-primary">{row.username}</span>
                        <span className="num block text-[12px] text-text-secondary">{row.rating ?? "—"} · {row.matches} matches</span>
                      </span>
                    </Link>
                    <span className="num shrink-0 text-right text-[14px]">{modeStat(row, scope)}</span>
                    <ChallengeButton username={row.username} self={me === row.username.toLowerCase()} onChallenge={challenge} />
                  </li>
                ))}
              </ol>
            </>
          )}
        </ResourceView>
      </section>
      {sheet}
    </PageContainer>
  );
}

"use client";

import { Gift, Sparkles, Trophy, UserPlus } from "lucide-react";
import Link from "next/link";
import { loginHref } from "@/auth/redirect";
import { useViewer } from "@/features/auth/viewer";
import { useResource } from "@/hooks/use-resource";
import { PageContainer } from "@/components/shell/page-container";
import { PlayerAvatar } from "@/components/social/player-avatar";
import { Button } from "@/components/ui/button";
import { CopyValue } from "@/components/ui/copy-value";
import { Card } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ResourceView } from "@/components/ui/states";
import type { PointsSummary } from "@/types/points";

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface-1 p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted">{label}</p>
      <p className="num mt-1 text-[24px] font-semibold leading-none text-text-primary">{value}</p>
      {hint ? <p className="mt-1.5 text-[12px] text-text-secondary">{hint}</p> : null}
    </div>
  );
}

function Mine({ points }: { points: PointsSummary }) {
  const link = points.referralCode ? `https://kova.surf/?ref=${encodeURIComponent(points.referralCode)}` : null;
  return (
    <>
      <section aria-label="Your points" className="kova-stagger grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={`Season ${points.season}`} value={points.total.toLocaleString("en-US")} hint="Your points" />
        <Stat label="From games" value={(points.breakdown.play + points.breakdown.win).toLocaleString("en-US")} hint={`${points.breakdown.win.toLocaleString("en-US")} from wins`} />
        <Stat label="From invites" value={(points.breakdown.referral + points.breakdown.welcome).toLocaleString("en-US")} hint={`${points.qualified} of ${points.invited} friends played`} />
        <Stat label="Invited by" value={points.referredBy ? `@${points.referredBy}` : "—"} />
      </section>

      <Card className="space-y-3 p-5">
        <h2 className="flex items-center gap-2 font-display text-[18px] font-bold text-text-primary"><UserPlus size={18} className="text-accent" aria-hidden="true" /> Your invite link</h2>
        {link ? (
          <>
            <CopyValue label="Invite link" value={link} className="border border-border-strong bg-surface-2" />
            <p className="text-[13px] text-text-secondary">
              When a friend opens this link, signs up and finishes their first staked game, you get {points.rules.referral} points and they get {points.rules.welcome}.
            </p>
          </>
        ) : (
          <p className="text-[14px] text-text-secondary">
            Choose a username first; it becomes your invite code. <Link href="/profile/me" className="text-accent hover:underline">Set up your profile</Link>
          </p>
        )}
      </Card>
    </>
  );
}

/** Season points: what you have, how to earn more, and the season's top players. */
export function PointsScreen() {
  const viewer = useViewer();
  const mine = useResource((s, ctx) => s.points.me(ctx), [viewer.status], { enabled: viewer.status === "authed", refreshMs: 60_000 });
  const board = useResource((s, ctx) => s.points.leaderboard(ctx), [], { refreshMs: 60_000 });

  return (
    <PageContainer as="main" className="space-y-6">
      <header className="space-y-2">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-accent-line bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-[#c3a9ff]">
          <Sparkles size={13} aria-hidden="true" /> Season 1
        </p>
        <h1 className="font-display text-[34px] font-bold leading-tight tracking-[-0.02em] text-text-primary md:text-[40px]">Points</h1>
        <p className="max-w-[680px] text-[16px] text-text-secondary">
          Earn points by playing staked games and inviting friends who play. Points have no cash value. A future season may convert them to rewards.
        </p>
      </header>

      {viewer.status === "guest" ? (
        <EmptyState title="Sign in to see your points" body="Points and invite links belong to your KOVA account." action={<Button href={loginHref("/points")}>Sign in</Button>} />
      ) : null}
      {viewer.status === "authed" ? (
        <ResourceView
          state={mine.state}
          onRetry={mine.refetch}
          errorTitle="Your points couldn't load"
          pendingTitle="Points aren't connected yet"
          loading={<div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-hidden="true">{Array.from({ length: 4 }, (_, key) => <Skeleton key={key} className="h-24 w-full" />)}</div>}
        >
          {(points) => <Mine points={points} />}
        </ResourceView>
      ) : null}

      <section aria-labelledby="earn-title" className="rounded-card border border-border-subtle bg-surface-1 p-5">
        <h2 id="earn-title" className="flex items-center gap-2 font-display text-[18px] font-bold text-text-primary"><Gift size={18} className="text-accent" aria-hidden="true" /> How to earn</h2>
        <ul className="mt-3 grid gap-2 text-[14px] text-text-secondary sm:grid-cols-2">
          <li><span className="num font-semibold text-text-primary">+10</span> for every staked game that settles</li>
          <li><span className="num font-semibold text-text-primary">+25</span> more when you win it</li>
          <li><span className="num font-semibold text-text-primary">+100</span> when a friend you invited finishes their first staked game</li>
          <li><span className="num font-semibold text-text-primary">+50</span> welcome points for the friend</li>
        </ul>
        <p className="mt-3 text-[12px] text-text-muted">AI agents and the House play without earning points. Invite links count only for new players who haven&apos;t played yet.</p>
      </section>

      <section aria-labelledby="board-title" className="space-y-3">
        <h2 id="board-title" className="flex items-center gap-2 font-display text-[20px] font-bold text-text-primary"><Trophy size={18} className="text-accent" aria-hidden="true" /> Top of Season 1</h2>
        <ResourceView
          state={board.state}
          onRetry={board.refetch}
          errorTitle="The points board couldn't load"
          pendingTitle="Points aren't connected yet"
          loading={<div className="space-y-2" aria-hidden="true">{Array.from({ length: 5 }, (_, key) => <Skeleton key={key} className="h-12 w-full" />)}</div>}
          isEmpty={(rows) => rows.length === 0}
          empty={<EmptyState title="No points yet" body="Finish a staked game to get on the board." />}
        >
          {(rows) => (
            <ol className="kova-stagger divide-y divide-border-subtle rounded-card border border-border-subtle bg-surface-1">
              {rows.map((row) => (
                <li key={row.username}>
                  <Link href={`/profile/${encodeURIComponent(row.username)}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
                    <span className="num w-6 text-[13px] font-semibold text-text-secondary">{row.rank}</span>
                    <PlayerAvatar username={row.username} src={row.avatarUrl} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-text-primary">{row.displayName ?? row.username}</span>
                    <span className="num text-[14px] text-text-primary">{row.points.toLocaleString("en-US")}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </ResourceView>
      </section>
    </PageContainer>
  );
}

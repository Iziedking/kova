"use client";

import { BadgeCheck, Settings, Swords, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { formatAnsemRaw, formatPct } from "@/lib/format";
import { loginHref } from "@/auth/redirect";
import { useViewer } from "@/features/auth/viewer";
import { useChallenge } from "@/features/competitions/use-challenge";
import { useResource } from "@/hooks/use-resource";
import { PriceChange } from "@/components/markets/price-change";
import { PageContainer } from "@/components/shell/page-container";
import { MatchHistoryRow } from "@/components/social/match-history-row";
import { PlayerAvatar } from "@/components/social/player-avatar";
import { PlayerStats } from "@/components/social/player-stats";
import { StreakBadge } from "@/components/social/streak-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ResourceView } from "@/components/ui/states";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import type { MatchHistoryItem, PlayerProfile } from "@/types/social";

type ProfileTab = "overview" | "matches" | "trading" | "predictions";

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] text-text-secondary">{label}</dt>
      <dd className="num mt-0.5 text-[20px] font-semibold text-text-primary">{children}</dd>
    </div>
  );
}

function History({ items, empty }: { items: MatchHistoryItem[]; empty: string }) {
  if (items.length === 0) return <EmptyState compact title={empty} />;
  return <ul className="divide-y divide-border-subtle">{items.map((item) => <MatchHistoryRow key={item.id} item={item} />)}</ul>;
}

function ProfileBody({ profile, isMe }: { profile: PlayerProfile; isMe: boolean }) {
  const idBase = useId();
  const [tab, setTab] = useState<ProfileTab>("overview");
  const { challenge, sheet } = useChallenge();
  const history = useResource((s) => s.social.history(profile.username), [profile.username]);
  const items = history.state.status === "ready" ? history.state.data : [];
  const best = items.filter((item) => item.returnPct !== null).sort((a, b) => (b.returnPct ?? 0) - (a.returnPct ?? 0))[0] ?? null;
  const trading = items.filter((item) => item.mode === "trading");
  const predictions = items.filter((item) => item.mode === "prediction");
  const { stats } = profile;

  return (
    <div className="space-y-6">
      <Card as="section" className="p-5 md:p-7">
        <div className="flex flex-wrap items-center gap-5">
          <PlayerAvatar username={profile.username} src={profile.avatarUrl} size="xl" ring />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate font-display text-[32px] font-bold leading-9 tracking-[-0.02em] text-text-primary md:text-[38px]">@{profile.username}</h1>
              {profile.verified ? <BadgeCheck size={22} className="text-info" aria-label="Verified" /> : null}
            </div>
            {profile.displayName ? <p className="mt-0.5 text-[15px] text-text-secondary">{profile.displayName}</p> : null}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[14px] text-text-secondary">
              {profile.rating ? <span>Rating <span className="num font-semibold text-text-primary">{profile.rating}</span></span> : null}
              <StreakBadge streak={stats.currentStreak} />
            </div>
          </div>
          {isMe ? (
            <div className="flex flex-wrap gap-2.5">
              <Button href="/portfolio" variant="secondary" iconLeft={<Wallet size={16} />}>Portfolio</Button>
              <Button href="/settings" variant="secondary" iconLeft={<Settings size={16} />}>Settings</Button>
            </div>
          ) : (
            <Button size="lg" iconLeft={<Swords size={17} />} onClick={() => challenge(profile.username)}>Challenge</Button>
          )}
        </div>
      </Card>

      <PlayerStats stats={stats} />

      <Card as="section" className="p-5">
        <Tabs
          idBase={idBase}
          label="Profile sections"
          value={tab}
          onValueChange={setTab}
          items={[
            { value: "overview", label: "Overview" },
            { value: "matches", label: "Matches" },
            { value: "trading", label: "Trading" },
            { value: "predictions", label: "Predictions" },
          ]}
        />
        <div className="pt-5">
          <TabPanel idBase={idBase} value="overview" active={tab === "overview"} className="space-y-6">
            <dl className="grid grid-cols-2 gap-5 lg:grid-cols-4">
              <Metric label="Current streak">{stats.currentStreak ? `${stats.currentStreak} wins` : "—"}</Metric>
              <Metric label="Best result">{best ? <PriceChange value={best.returnPct} className="text-[20px] font-semibold" /> : "—"}</Metric>
              <Metric label="Favorite narrative">{profile.favoriteNarrative ?? "—"}</Metric>
              <Metric label="Total payouts">
                {formatAnsemRaw(items.reduce((sum, item) => sum + BigInt(item.payoutAnsemRaw ?? "0"), 0n).toString())}
              </Metric>
            </dl>
            <div>
              <h2 className="mb-2 font-display text-[16px] font-bold text-text-primary">Recent showdowns</h2>
              <ResourceView state={history.state} compact onRetry={history.refetch} pendingTitle="Match history isn't connected yet" loading={<Skeleton className="h-32 w-full" />}>
                {(rows) => <History items={rows.slice(0, 5)} empty="No matches yet." />}
              </ResourceView>
            </div>
          </TabPanel>

          <TabPanel idBase={idBase} value="matches" active={tab === "matches"}>
            <ResourceView state={history.state} compact onRetry={history.refetch} pendingTitle="Match history isn't connected yet" loading={<Skeleton className="h-40 w-full" />}>
              {(rows) => <History items={rows} empty="No matches yet." />}
            </ResourceView>
          </TabPanel>

          <TabPanel idBase={idBase} value="trading" active={tab === "trading"} className="space-y-6">
            <dl className="grid grid-cols-2 gap-5 lg:grid-cols-4">
              <Metric label="Avg PnL"><PriceChange value={stats.avgTradingPnlPct} className="text-[20px] font-semibold" /></Metric>
              <Metric label="Best PnL"><PriceChange value={stats.bestTradingPnlPct} className="text-[20px] font-semibold" /></Metric>
              <Metric label="Win rate">{stats.tradingWinRate == null ? "—" : formatPct(stats.tradingWinRate, { digits: 0, signed: false })}</Metric>
              <Metric label="Trading matches">{trading.length}</Metric>
            </dl>
            <History items={trading} empty="No Trading matches yet." />
          </TabPanel>

          <TabPanel idBase={idBase} value="predictions" active={tab === "predictions"} className="space-y-6">
            <dl className="grid grid-cols-2 gap-5 lg:grid-cols-4">
              <Metric label="Win rate">{stats.predictionWinRate == null ? "—" : formatPct(stats.predictionWinRate, { digits: 0, signed: false })}</Metric>
              <Metric label="Avg pick return"><PriceChange value={stats.avgPredictionReturnPct} className="text-[20px] font-semibold" /></Metric>
              <Metric label="Predict matches">{predictions.length}</Metric>
            </dl>
            <p className="text-[13px] text-text-muted">Picks are shown only after the reveal.</p>
            <History items={predictions} empty="No Predict matches yet." />
          </TabPanel>
        </div>
      </Card>
      {sheet}
    </div>
  );
}

/**
 * Public player profile (blueprint 27). Identity is a username and a record -
 * never a wallet address. `/profile/me` resolves to the signed-in viewer.
 */
export function ProfileScreen({ username }: { username: string }) {
  const viewer = useViewer();
  const router = useRouter();
  const isMeAlias = username.toLowerCase() === "me";
  const resolved = isMeAlias ? (viewer.identity?.username ?? null) : username;
  const guest = isMeAlias && viewer.status === "guest";

  useEffect(() => {
    if (guest) router.replace(loginHref("/profile/me", "required"));
  }, [guest, router]);

  const { state, refetch } = useResource((s) => s.social.profile(resolved as string), [resolved], { enabled: resolved !== null });
  const isMe = resolved !== null && viewer.identity?.username.toLowerCase() === resolved.toLowerCase();

  return (
    <PageContainer as="main">
      {isMeAlias && viewer.status === "authed" && !viewer.identity ? (
        <EmptyState title="Finish setting up your profile" body="Pick a username to get your public Kova profile." action={<Button href={loginHref("/profile/me")} size="sm">Choose a username</Button>} />
      ) : (
        <ResourceView
          state={state}
          onRetry={refetch}
          errorTitle="We couldn't find that player"
          pendingTitle="Profiles aren't connected yet"
          loading={
            <div className="space-y-5" aria-hidden="true">
              <Skeleton className="h-40 w-full" />
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-24 w-full" />)}
              </div>
              <Skeleton className="h-64 w-full" />
            </div>
          }
        >
          {(profile) => <ProfileBody profile={profile} isMe={isMe} />}
        </ResourceView>
      )}
    </PageContainer>
  );
}

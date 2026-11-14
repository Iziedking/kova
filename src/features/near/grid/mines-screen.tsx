"use client";

import { ArrowRight, Flame } from "lucide-react";
import Link from "next/link";
import { type MineInfo, burnedTotal, formatUnits } from "@/adapters/near/grid";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/section";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/skeleton";
import { NEAR_OPEN_PATH, minePath } from "../paths";
import { useNow } from "../use-now";
import { usePoll } from "../use-poll";
import { CookingNow } from "./cooking-now";
import { ForemanPanel } from "./foreman-panel";
import { getGrid } from "./use-grid";
import { Page, PageTitle, mmss } from "./ui";

function MineCard({ info }: { info: MineInfo }) {
  const grid = getGrid();
  const now = useNow();
  const meta = usePoll(() => grid.metadata(info.token), 60_000, `meta:${info.token}`);
  const stats = usePoll(() => grid.stats(info.mine), 10_000, `stats:${info.mine}`);
  const cur = usePoll(() => grid.currentRound(info.mine), 4_000, `cur:${info.mine}`);
  const decimals = meta.data?.decimals ?? 18;
  const symbol = meta.data?.symbol ?? "…";
  const left = cur.data && now ? Math.max(0, cur.data.ends_at - now) : null;
  return (
    <Link href={minePath(info.token)} className="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-accent">
      <Card className="h-full space-y-4 p-5 transition-colors group-hover:border-border-strong" as="article">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-[22px] font-bold text-text-primary">{symbol}</h2>
          <Badge tone={cur.data?.open ? "success" : "neutral"} dot>{cur.data ? (cur.data.open ? "Open" : "Closed a minute") : "…"}</Badge>
        </div>
        <dl className="grid grid-cols-3 gap-3 text-[13px]">
          <div><dt className="text-text-muted">This round</dt><dd className="num mt-0.5 font-semibold text-text-primary">{cur.data ? `${formatUnits(cur.data.total, decimals)} ${symbol}` : "…"}</dd></div>
          <div><dt className="text-text-muted">Players</dt><dd className="num mt-0.5 font-semibold text-text-primary">{cur.data ? cur.data.players : "…"}</dd></div>
          <div><dt className="text-text-muted">Next result</dt><dd className="num mt-0.5 font-semibold text-text-primary">{left === null ? "…" : mmss(left)}</dd></div>
        </dl>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-text-secondary">
          <Flame size={14} className="text-warning" aria-hidden="true" />
          <span className="num">{stats.data ? formatUnits(burnedTotal(stats.data), decimals) : "…"} {symbol} burned</span>
          <span aria-hidden="true">·</span>
          <span className="num">{stats.data ? `${stats.data.rounds_settled} won, ${stats.data.rounds_refunded} refunded` : ""}</span>
        </p>
        <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#b79bff]">Open the grid <ArrowRight size={14} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" /></span>
      </Card>
    </Link>
  );
}

export function MinesScreen() {
  const grid = getGrid();
  const mines = usePoll(() => grid.mines(), 30_000, "mines");
  return (
    <Page>
      <PageTitle title="Mines">Every coin has its own mine: a 5 by 5 grid that picks one winning square every minute. Pick a coin to play.</PageTitle>
      {mines.error && !mines.data ? <ErrorState title="Could not read the mines" body={mines.error} /> : null}
      {mines.data === null && !mines.error ? (
        <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
      ) : null}
      {mines.data && mines.data.length === 0 ? <EmptyState title="No mines yet" body={<>Nothing has been opened on this factory. <Link className="text-[#b79bff] underline" href={NEAR_OPEN_PATH}>Open the first mine.</Link></>} /> : null}
      {mines.data && mines.data.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{mines.data.map((m) => <MineCard key={m.mine} info={m} />)}</div>
      ) : null}
      <ForemanPanel />
      <CookingNow />
      <p className="text-[13px] text-text-muted">
        Want a mine for another coin? <Link className="text-[#b79bff] underline" href={NEAR_OPEN_PATH}>See which coins the factory accepts.</Link>
      </p>
    </Page>
  );
}

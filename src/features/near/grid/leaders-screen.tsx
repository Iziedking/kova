"use client";

import { Trophy } from "lucide-react";
import Link from "next/link";
import { type MineInfo, type RoundSummary, type TokenMetadata, formatUnits, shortAccount } from "@/adapters/near/grid";
import { Card, SectionHeader } from "@/components/ui/section";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/skeleton";
import { minePath } from "../paths";
import { usePoll } from "../use-poll";
import { useGridPlayer, getGrid } from "./use-grid";
import { Page, PageTitle } from "./ui";

type Row = { player: string; wins: number; won: bigint; staked: bigint };

/** Totals per player over the rounds the contract still holds. Pure, so it can be checked on its own. */
export function leaderRows(rounds: readonly RoundSummary[]): Row[] {
  const by = new Map<string, Row>();
  for (const r of rounds) {
    if (r.outcome !== "settled") continue;
    for (const w of r.winners) {
      const row = by.get(w.player) ?? { player: w.player, wins: 0, won: 0n, staked: 0n };
      row.wins += 1;
      row.won += w.award;
      row.staked += w.staked;
      by.set(w.player, row);
    }
  }
  return [...by.values()].sort((a, b) => (b.won === a.won ? b.wins - a.wins : b.won > a.won ? 1 : -1));
}

function MineBoardRows({ info }: { info: MineInfo }) {
  const grid = getGrid();
  const { accountId } = useGridPlayer();
  const meta = usePoll(() => grid.metadata(info.token), 60_000, `meta:${info.token}`);
  const recent = usePoll(() => grid.recent(info.mine, 24), 15_000, `recent24:${info.mine}`);
  const decimals = meta.data?.decimals ?? 18;
  const symbol = meta.data?.symbol ?? "…";
  const rows = recent.data ? leaderRows(recent.data) : null;
  const settled = recent.data?.filter((r) => r.outcome === "settled").length ?? 0;
  return (
    <Card className="p-5" as="section">
      <SectionHeader title={`${symbol} mine`} as="h2" icon={<Trophy size={18} />} action={{ label: "Open grid", href: minePath(info.token) }} />
      {recent.error && !rows ? <ErrorState title="Could not load this mine" body={recent.error} /> : null}
      {!rows && !recent.error ? <Skeleton className="h-24 w-full" /> : null}
      {rows && rows.length === 0 ? <p className="text-[14px] text-text-secondary">No winners yet.</p> : null}
      {rows && rows.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-[13px]">
              <thead className="text-text-muted"><tr><th className="pb-2 font-medium">#</th><th className="pb-2 font-medium">Player</th><th className="pb-2 text-right font-medium">Won</th><th className="pb-2 text-right font-medium">Paid</th></tr></thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.slice(0, 10).map((r, i) => (
                  <tr key={r.player}>
                    <td className="num py-2 text-text-muted">{i + 1}</td>
                    <td className={r.player === accountId ? "py-2 font-semibold text-text-primary" : "py-2 text-text-secondary"}>{r.player === accountId ? "You" : shortAccount(r.player, 28)}</td>
                    <td className="num py-2 text-right text-text-secondary">{r.wins}</td>
                    <td className="num py-2 text-right text-text-primary">{formatUnits(r.won, decimals)} {symbol}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12px] text-text-muted">Last {recent.data?.length ?? 0} rounds ({settled} with a winner). Paid includes the stake returned.</p>
        </>
      ) : null}
    </Card>
  );
}

type Ranked = { rank: number; player: string; played: number; won: number; byCoin: { token: string; line: { played: number; won: number; refunded: number; staked: string; awarded: string; lost: string; burned: string }; net: string }[] };
type Standings = { recording: boolean; startedAt?: number; updatedAt?: number; ranked: Ranked[] };

async function readStandings(): Promise<Standings> {
  const response = await fetch("/api/near/standings");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as Standings;
}

/** One ranking across every coin, from the books the keeper keeps (npm run keeper:near). */
function GlobalRanking() {
  const grid = getGrid();
  const { accountId } = useGridPlayer();
  const standings = usePoll(readStandings, 20_000, "standings");
  const data = standings.data;
  const tokens = [...new Set(data?.ranked.flatMap((r) => r.byCoin.map((c) => c.token)) ?? [])].sort();
  const metas = usePoll(
    tokens.length > 0 ? async () => Object.fromEntries(await Promise.all(tokens.map(async (t) => [t, await grid.metadata(t)] as const))) as Record<string, TokenMetadata> : null,
    60_000,
    `standings-meta:${tokens.join(",")}`,
  );
  const fmt = (token: string, v: string) => formatUnits(BigInt(v), metas.data?.[token]?.decimals ?? 18);
  const symbol = (token: string) => metas.data?.[token]?.symbol ?? token.split(".")[0].toUpperCase();
  // Shown only where the keeper's books are readable. On a host without them (the site and keeper on
  // different machines), the per-mine winners below, read from the chain, are the whole page.
  if (data && !data.recording) return null;
  return (
    <Card className="p-5" as="section">
      <SectionHeader title="Global ranking" as="h2" icon={<Trophy size={18} />} />
      <p className="text-[14px] leading-6 text-text-secondary">All coins, ranked by rounds won. <span className="text-text-muted">Net is paid out minus staked, not counting new CHIP. Burned is the player&apos;s share of burned coins.</span></p>
      {standings.error && !data ? <ErrorState title="Could not load the ranking" body={standings.error} /> : null}
      {!data && !standings.error ? <Skeleton className="mt-3 h-24 w-full" /> : null}
      {data && !data.recording ? <p className="mt-3 text-[14px] text-text-secondary">No ranking yet. It starts when the keeper settles a round.</p> : null}
      {data && data.recording && data.ranked.length === 0 ? <p className="mt-3 text-[14px] text-text-secondary">No settled rounds yet.</p> : null}
      {data && data.ranked.length > 0 ? (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead className="text-text-muted"><tr><th className="pb-2 font-medium">#</th><th className="pb-2 font-medium">Player</th><th className="pb-2 text-right font-medium">Won</th><th className="pb-2 text-right font-medium">Played</th><th className="pb-2 pl-4 font-medium">Net and burned</th></tr></thead>
              <tbody className="divide-y divide-border-subtle">
                {data.ranked.slice(0, 25).map((r) => (
                  <tr key={r.player} className="align-top">
                    <td className="num py-2 text-text-muted">{r.rank}</td>
                    <td className={r.player === accountId ? "py-2 font-semibold text-text-primary" : "py-2 text-text-secondary"}>{r.player === accountId ? "You" : shortAccount(r.player, 26)}</td>
                    <td className="num py-2 text-right text-text-primary">{r.won}</td>
                    <td className="num py-2 text-right text-text-secondary">{r.played}</td>
                    <td className="num py-2 pl-4 text-text-secondary">
                      {r.byCoin.map((c) => (
                        <div key={c.token}>
                          <span className="text-text-primary">{symbol(c.token)}</span> net {BigInt(c.net) >= 0n ? "+" : ""}{fmt(c.token, c.net)} · burned {fmt(c.token, c.line.burned)}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12px] text-text-muted">Recorded by the keeper since {data.startedAt ? new Date(data.startedAt * 1000).toLocaleString() : "it started"}.</p>
        </>
      ) : null}
    </Card>
  );
}

export function LeadersScreen() {
  const grid = getGrid();
  const mines = usePoll(() => grid.mines(), 30_000, "mines");
  return (
    <Page>
      <PageTitle title="Leaderboard">Who wins, earns and burns across all coins.</PageTitle>
      <GlobalRanking />
      {mines.error && !mines.data ? <ErrorState title="Could not load mines" body={mines.error} /> : null}
      {mines.data === null && !mines.error ? <Skeleton className="h-40 w-full" /> : null}
      {mines.data && mines.data.length === 0 ? <EmptyState title="No mines yet" body={<>Open one from <Link className="text-[#b79bff] underline" href="/near/open">Open a mine</Link>.</>} /> : null}
      <div className="grid gap-5 lg:grid-cols-2">{mines.data?.map((m) => <MineBoardRows key={m.mine} info={m} />)}</div>
    </Page>
  );
}

"use client";

import { Trophy } from "lucide-react";
import Link from "next/link";
import { type MineInfo, type RoundSummary, formatUnits, shortAccount } from "@/adapters/near/grid";
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
  const meta = usePoll(() => grid.metadata(info.token), 600_000, `meta:${info.token}`);
  const recent = usePoll(() => grid.recent(info.mine, 24), 15_000, `recent24:${info.mine}`);
  const decimals = meta.data?.decimals ?? 18;
  const symbol = meta.data?.symbol ?? "…";
  const rows = recent.data ? leaderRows(recent.data) : null;
  const settled = recent.data?.filter((r) => r.outcome === "settled").length ?? 0;
  return (
    <Card className="p-5" as="section">
      <SectionHeader title={`${symbol} mine`} as="h2" icon={<Trophy size={18} />} action={{ label: "Open the grid", href: minePath(info.token) }} />
      {recent.error && !rows ? <ErrorState title="Could not read this mine" body={recent.error} /> : null}
      {!rows && !recent.error ? <Skeleton className="h-24 w-full" /> : null}
      {rows && rows.length === 0 ? <p className="text-[14px] text-text-secondary">Nobody has won a round here in the results the contract still holds.</p> : null}
      {rows && rows.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-[13px]">
              <thead className="text-text-muted"><tr><th className="pb-2 font-medium">#</th><th className="pb-2 font-medium">Player</th><th className="pb-2 text-right font-medium">Rounds won</th><th className="pb-2 text-right font-medium">Paid out</th></tr></thead>
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
          <p className="mt-3 text-[12px] text-text-muted">From the last {recent.data?.length ?? 0} results the contract holds ({settled} with a winner). &ldquo;Paid out&rdquo; includes the stake returned.</p>
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
      <PageTitle title="Leaderboard">Who has won the most in each mine. The contracts keep only the last 24 results, so this is recent play, not all time.</PageTitle>
      {mines.error && !mines.data ? <ErrorState title="Could not read the mines" body={mines.error} /> : null}
      {mines.data === null && !mines.error ? <Skeleton className="h-40 w-full" /> : null}
      {mines.data && mines.data.length === 0 ? <EmptyState title="No mines yet" body={<>Open one from <Link className="text-[#b79bff] underline" href="/near/open">Open a mine</Link>.</>} /> : null}
      <div className="grid gap-5 lg:grid-cols-2">{mines.data?.map((m) => <MineBoardRows key={m.mine} info={m} />)}</div>
    </Page>
  );
}

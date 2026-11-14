"use client";

import { Check, Coins, Flame, X } from "lucide-react";
import { useState } from "react";
import { failureMessage } from "@/adapters/near/chip";
import { GAS, GRID_CHIP, GRID_FACTORY, burnedTotal, formatUnits } from "@/adapters/near/grid";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/section";
import { ErrorState, InlineNotice } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/skeleton";
import { useNow } from "../use-now";
import { usePoll } from "../use-poll";
import { GridGate } from "./grid-gate";
import { getGrid, useGridPlayer } from "./use-grid";
import { ExplorerLink, Page, PageTitle, Stat } from "./ui";

const fmt = (v: bigint | undefined, digits = 2) => (v === undefined ? "…" : formatUnits(v, 18, digits));

/** What the chain says about one account's keys, shown as a plain statement. */
function KeyProof({ label, accountId, expectGlobal }: { label: string; accountId: string; expectGlobal?: string }) {
  const grid = getGrid();
  const proof = usePoll(() => grid.accountProof(accountId), 60_000, `proof:${accountId}`);
  const p = proof.data;
  const keyless = p !== null && p.keys === 0;
  const runsExpected = p !== null && expectGlobal ? p.globalHash === expectGlobal : null;
  return (
    <li className="flex flex-wrap items-start gap-3 py-3">
      <span className={keyless ? "mt-0.5 text-success" : "mt-0.5 text-warning"} aria-hidden="true">{p ? keyless ? <Check size={16} /> : <X size={16} /> : null}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-text-primary">{label}</p>
        <p className="num mt-0.5 break-all text-[12px] text-text-muted"><ExplorerLink href={grid.accountUrl(accountId)}>{accountId}</ExplorerLink></p>
        <p className="mt-1 text-[13px] text-text-secondary">
          {proof.error && !p ? `Could not read: ${proof.error}` : !p ? "Loading…" : keyless ? "No access keys." : `${p.keys} access key${p.keys === 1 ? "" : "s"} (${p.fullAccessKeys} full access).`}
          {runsExpected === true ? " Runs the published code." : runsExpected === false ? " Does not run the published code." : ""}
        </p>
      </div>
    </li>
  );
}

export function ChipScreen() {
  const grid = getGrid();
  const player = useGridPlayer();
  const now = useNow();
  const stats = usePoll(() => grid.chipStats(), 6_000, "chip-stats");
  const config = usePoll(() => grid.chipConfig(), 60_000, "chip-config");
  const mines = usePoll(() => grid.mines(), 30_000, "mines");
  const factory = usePoll(() => grid.factoryConfig(), 60_000, "factory-config");
  const burns = usePoll(
    mines.data
      ? async () =>
          Promise.all(
            mines.data!.map(async (m) => {
              const [meta, s] = await Promise.all([grid.metadata(m.token), grid.stats(m.mine)]);
              return { mine: m, symbol: meta.symbol, decimals: meta.decimals, burned: burnedTotal(s), settled: s.rounds_settled, refunded: s.rounds_refunded };
            }),
          )
      : null,
    15_000,
    `burns:${mines.data?.length ?? 0}`,
  );
  const [claiming, setClaiming] = useState(false);
  const [claimNotice, setClaimNotice] = useState<{ tone: "info" | "danger"; text: string; url?: string } | null>(null);

  const s = stats.data;
  const c = config.data;
  const nextHalving = s && c ? s.launched_at + c.halving_seconds * (Math.floor((Math.max(now, s.launched_at) - s.launched_at) / c.halving_seconds) + 1) : null;
  const burnShare = s && s.total_minted > 0n ? Number((s.total_burned * 1000n) / s.total_minted) / 10 : 0;
  const starterLeft = s && c ? c.starter_budget - s.starter_minted : null;

  async function claimStarter() {
    setClaiming(true);
    const result = await player.near.callContract(GRID_CHIP, "claim_starter", {}, { gas: GAS.claimStarter });
    setClaiming(false);
    setClaimNotice(result.success ? { tone: "info", text: "You have 1,000 CHIP.", url: result.explorerUrl } : { tone: "danger", text: failureMessage(result.failure), url: result.explorerUrl || undefined });
    player.refresh();
    stats.refresh();
  }

  return (
    <Page>
      <PageTitle title="CHIP">Kova&apos;s coin. Winners earn it. No premine. Numbers are read from the contract.</PageTitle>
      {stats.error && !s ? <ErrorState title="Could not read CHIP" body={stats.error} /> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="space-y-6 p-6" as="section">
          <div>
            <p className="text-[13px] text-text-muted">In circulation</p>
            <div className="num mt-1 text-[44px] font-bold leading-none tracking-[-0.02em] text-text-primary">{s ? fmt(s.total_supply, 0) : <Skeleton className="h-10 w-48" />}</div>
            <p className="mt-2 text-[14px] text-text-secondary">Minted <span className="num">{fmt(s?.total_minted)}</span>, burned <span className="num">{fmt(s?.total_burned)}</span>, cap <span className="num">{fmt(s?.cap, 0)}</span>.</p>
          </div>
          <div>
            <div className="flex items-center justify-between text-[13px] text-text-secondary"><span>Burned</span><span className="num">{burnShare}%</span></div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${burnShare}% of minted CHIP has been burned`}>
              <div className="h-full rounded-full bg-warning" style={{ width: `${Math.min(100, burnShare)}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="From rounds" value={fmt(s?.emission_minted)} hint="Paid to winners" />
            <Stat label="From jackpot" value={fmt(s?.motherlode_minted)} hint={s ? `${s.motherlode_hits} hit${s.motherlode_hits === 1 ? "" : "s"}` : undefined} />
            <Stat label="Starter claims" value={fmt(s?.starter_minted, 0)} hint={s ? `${s.starters_claimed} account${s.starters_claimed === 1 ? "" : "s"}` : undefined} />
            <Stat label="Rounds" value={s ? String(s.rounds_reported) : "…"} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="space-y-2 p-5" as="section">
            <SectionHeader title="Jackpot" as="h2" className="mb-0" />
            <p className="num text-[32px] font-bold text-text-primary">{fmt(s?.motherlode)} <span className="text-[16px] font-medium text-text-muted">CHIP</span></p>
            <p className="text-[13px] leading-5 text-text-secondary">+{c ? fmt(c.motherlode_per_round) : "…"} CHIP per round with a winner, up to {fmt(c?.motherlode_cap, 0)}. Each such round has a 1 in {c ? c.motherlode_odds : "…"} chance to pay it all out.</p>
          </Card>
          <Card className="space-y-2 p-5" as="section">
            <SectionHeader title="Emission" as="h2" className="mb-0" />
            <p className="num text-[24px] font-bold text-text-primary">{fmt(s?.emission_rate)} <span className="text-[14px] font-medium text-text-muted">CHIP a minute, all mines</span></p>
            <p className="text-[13px] leading-5 text-text-secondary">Halves every {c ? Math.round(c.halving_seconds / 86_400) : "…"} days. {nextHalving && now ? `Next in ${Math.max(0, Math.ceil((nextHalving - now) / 86_400))} days.` : ""}</p>
          </Card>
        </div>
      </div>

      <Card className="p-5" as="section">
        <SectionHeader title="Burned per mine" as="h2" icon={<Flame size={18} />} />
        {burns.data ? (
          <ul className="divide-y divide-border-subtle">
            {burns.data.map((b) => (
              <li key={b.mine.mine} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-[14px]">
                <span className="font-medium text-text-primary">{b.symbol}</span>
                <span className="num text-text-secondary">{formatUnits(b.burned, b.decimals)} {b.symbol} in {b.settled} rounds ({b.refunded} refunded)</span>
              </li>
            ))}
          </ul>
        ) : <Skeleton className="h-16 w-full" />}
      </Card>

      <Card className="p-5" as="section">
        <SectionHeader title="No admin key" as="h2" />
        <p className="text-[14px] leading-6 text-text-secondary">Read live from the chain. A mine with no keys cannot be changed or drained. On testnet, CHIP and the factory still hold a key.</p>
        <ul className="mt-2 divide-y divide-border-subtle">
          {mines.data?.map((m) => <KeyProof key={m.mine} label={`The ${shortSymbol(m.token)} mine`} accountId={m.mine} expectGlobal={factory.data?.mine_code_hash} />)}
          <KeyProof label="CHIP" accountId={GRID_CHIP} />
          <KeyProof label="The factory" accountId={GRID_FACTORY} />
        </ul>
        {factory.data ? <p className="num mt-3 break-all text-[12px] text-text-muted">Mine code: {factory.data.mine_code_hash}</p> : null}
      </Card>

      <Card className="space-y-3 p-5" as="section">
        <SectionHeader title="Starter CHIP (testnet)" as="h2" icon={<Coins size={18} />} />
        <p className="text-[13px] leading-5 text-text-secondary">One claim per account: {c ? fmt(c.starter_amount, 0) : "…"} CHIP. {starterLeft !== null ? `${fmt(starterLeft, 0)} CHIP left.` : ""}</p>
        <GridGate />
        {player.step === "ready" ? (
          player.starterClaimed ? <p className="text-[14px] text-text-primary">You have {fmt(player.chipBalance ?? 0n)} CHIP.</p> : <Button iconLeft={<Coins size={16} />} loading={claiming} loadingLabel="Claiming…" onClick={() => void claimStarter()}>Get 1,000 CHIP</Button>
        ) : null}
        {claimNotice ? <InlineNotice tone={claimNotice.tone}>{claimNotice.text} {claimNotice.url ? <ExplorerLink href={claimNotice.url}>Transaction</ExplorerLink> : null}</InlineNotice> : null}
      </Card>
    </Page>
  );
}

function shortSymbol(token: string) {
  return token.split(".")[0].toUpperCase();
}

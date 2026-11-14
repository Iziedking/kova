"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { GRID_CHIP, GRID_FACTORY, SQUARES, burnedTotal, formatUnits } from "@/adapters/near/grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/section";
import { NEAR_CHIP_PATH, NEAR_MINES_PATH, minePath } from "../paths";
import { useNow } from "../use-now";
import { usePoll } from "../use-poll";
import { ForemanAiStatus } from "./foreman-panel";
import { MineBoard } from "./mine-board";
import { getGrid } from "./use-grid";
import { ExplorerLink, Page, Stat, mmss } from "./ui";

const STEPS = [
  "Pick a coin. Each coin has its own mine.",
  "Stake on any of 25 squares. You have 60 seconds.",
  "NEAR's random number picks the winning square.",
  "Winners get their stake back, a share of the losers' coins, and new CHIP. 10% of the losers' coins is burned.",
];

const QUESTIONS: { q: string; a: string }[] = [
  { q: "What is CHIP?", a: "Kova's own coin. Win rounds to earn it. On testnet you can claim 1,000 free." },
  { q: "Do I need a wallet?", a: "No. Sign in with email and Kova makes one for you. Approve once, then CHIP stakes need no popups. Other coins ask you to confirm each stake." },
  { q: "Is this gambling?", a: "On mainnet, yes: it is a game of chance with real coins. Today it runs on testnet with coins worth nothing." },
];

export function GridLanding() {
  const grid = getGrid();
  const now = useNow();
  const mines = usePoll(() => grid.mines(), 30_000, "mines");
  const chipMine = mines.data?.find((m) => m.token === GRID_CHIP) ?? null;
  const cur = usePoll(chipMine ? () => grid.currentRound(chipMine.mine) : null, 3_000, `cur:${chipMine?.mine}`);
  const chip = usePoll(() => grid.chipStats(), 8_000, "chip-stats");
  const totals = usePoll(
    mines.data
      ? async () => {
          const all = await Promise.all(mines.data!.map((m) => grid.stats(m.mine)));
          return { rounds: all.reduce((n, s) => n + s.rounds_settled + s.rounds_refunded, 0), won: all.reduce((n, s) => n + s.rounds_settled, 0), burnedChipMine: chipMine ? burnedTotal(all[mines.data!.indexOf(chipMine)]) : 0n };
        }
      : null,
    15_000,
    `totals:${mines.data?.length ?? 0}`,
  );
  const left = cur.data && now ? Math.max(0, cur.data.ends_at - now) : null;
  const empty = Array<bigint>(SQUARES).fill(0n);

  return (
    <>
      <section className="relative overflow-hidden bg-cover bg-[position:50%_70%]" style={{ backgroundImage: "linear-gradient(90deg, rgba(10,9,16,0.6) 0%, rgba(10,9,16,0.15) 55%, rgba(10,9,16,0) 100%), linear-gradient(180deg, rgba(10,9,16,0.35) 0%, rgba(10,9,16,0) 30%, rgba(10,9,16,0) 75%, var(--color-bg) 100%), url(/near/header-bg.webp)" }}>
        <div className="mx-auto grid w-full max-w-[var(--container-app)] items-center gap-10 px-4 pb-14 pt-36 md:px-8 md:pt-40 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <div>
          <h1 className="font-display text-[40px] font-bold leading-[1.05] tracking-[-0.03em] text-text-primary md:text-[60px]">Stake your memecoin. One square wins every minute.</h1>
          <p className="mt-5 max-w-[560px] text-[18px] leading-7 text-text-secondary">A mining game for NEAR memecoins. Losers pay winners. 10% of the losing coins is burned.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button href={chipMine ? minePath(chipMine.token) : NEAR_MINES_PATH} size="lg" iconRight={<ArrowRight size={16} />}>Start mining</Button>
            <Button href="#how" variant="secondary" size="lg">How it works</Button>
          </div>
          <p className="mt-4 max-w-[560px] text-[13px] leading-5 text-text-muted">Testnet only. These coins are worth nothing.</p>
        </div>
        <div className="space-y-3" aria-label="The CHIP mine, live">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] text-text-muted">Live: CHIP mine{cur.data ? `, round ${cur.data.id}` : ""}</p>
            <p className="num text-[22px] font-bold text-text-primary" aria-label={left === null ? "Loading" : `${left} seconds left`}>{left === null ? "–:––" : mmss(left)}</p>
          </div>
          <MineBoard totals={cur.data?.totals ?? empty} mine={empty} decimals={18} symbol="CHIP" selected={null} lastWinner={null} disabled onSelect={() => undefined} />
          <p className="num text-[12px] text-text-muted">{cur.data ? `${formatUnits(cur.data.total, 18)} CHIP from ${cur.data.players} player${cur.data.players === 1 ? "" : "s"}` : "Loading…"}</p>
        </div>
              </div>
      </section>
    <Page className="space-y-16 pt-10 md:pt-14">
      <section aria-label="Kova in numbers" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Mines" value={mines.data ? String(mines.data.length) : "…"} />
        <Stat label="Rounds" value={totals.data ? String(totals.data.rounds) : "…"} hint={totals.data ? `${totals.data.won} with a winner` : undefined} />
        <Stat label="CHIP burned" value={totals.data ? formatUnits(totals.data.burnedChipMine, 18) : "…"} />
        <Stat label="CHIP in circulation" value={chip.data ? formatUnits(chip.data.total_supply, 18, 0) : "…"} hint="Minted by winning" />
      </section>

      <section id="how" className="scroll-mt-24">
        <h2 className="font-display text-[28px] font-bold tracking-[-0.02em] text-text-primary">How it works</h2>
        <ol className="mt-5 grid gap-4 md:grid-cols-2">
          {STEPS.map((text, i) => (
            <li key={text} className="flex gap-4 rounded-xl border border-border-subtle bg-surface-2 p-5">
              <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent-line bg-accent-soft text-[14px] font-bold text-[#c3a9ff]">{i + 1}</span>
              <p className="text-[15px] leading-6 text-text-secondary">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="font-display text-[28px] font-bold tracking-[-0.02em] text-text-primary">Why mine</h2>
          <p className="mt-3 text-[16px] leading-7 text-text-secondary">Holders get a reason to come back every minute. Every round burns some of the coin.</p>
        </div>
        <div>
          <h2 className="font-display text-[28px] font-bold tracking-[-0.02em] text-text-primary">Jackpot</h2>
          <p className="mt-3 text-[16px] leading-7 text-text-secondary">A CHIP jackpot shared by all mines. Each round with a winner has a 1 in {625} chance to pay it out. Now: <span className="num font-semibold text-text-primary">{chip.data ? formatUnits(chip.data.motherlode, 18) : "…"}</span> CHIP.</p>
        </div>
      </section>

      <section>
        <h2 className="font-display text-[28px] font-bold tracking-[-0.02em] text-text-primary">The Foreman</h2>
        <p className="mt-3 max-w-[720px] text-[16px] leading-7 text-text-secondary">An AI agent. Powered by NEAR AI Cloud, with BRRRAIN as backup. It mines every round and posts a recap on chain. Its keys can only stake CHIP and post. <Link className="text-[#b79bff] underline" href={`${NEAR_MINES_PATH}#foreman`}>Latest recaps</Link></p>
        <ForemanAiStatus className="mt-2 max-w-[720px] text-[14px] leading-6 text-text-muted" />
      </section>

      <section>
        <h2 className="font-display text-[28px] font-bold tracking-[-0.02em] text-text-primary">Trust</h2>
        <div className="mt-3 grid gap-6 md:grid-cols-2">
          <p className="text-[16px] leading-7 text-text-secondary">Mines have no access keys. Nobody can change them, pause them or move their coins. <Link className="text-[#b79bff] underline" href={NEAR_CHIP_PATH}>Check it live.</Link> On testnet, the CHIP and factory accounts still hold a key.</p>
          <p className="text-[16px] leading-7 text-text-secondary">The winner comes from NEAR&apos;s random number. A validator could nudge it, so stakes are capped. Anyone can settle a round.</p>
        </div>
        <Card className="mt-5 p-4" as="div">
          <p className="text-[13px] text-text-secondary">Contracts: <ExplorerLink href={grid.accountUrl(GRID_FACTORY)}>factory</ExplorerLink> · <ExplorerLink href={grid.accountUrl(GRID_CHIP)}>CHIP</ExplorerLink>{mines.data?.map((m) => <span key={m.mine}> · <ExplorerLink href={grid.accountUrl(m.mine)}>{m.token.split(".")[0]} mine</ExplorerLink></span>)}</p>
        </Card>
      </section>

      <section>
        <h2 className="font-display text-[28px] font-bold tracking-[-0.02em] text-text-primary">Questions</h2>
        <dl className="mt-4 divide-y divide-border-subtle rounded-xl border border-border-subtle">
          {QUESTIONS.map(({ q, a }) => (
            <div key={q} className="grid gap-1 p-5 md:grid-cols-[260px_minmax(0,1fr)] md:gap-6">
              <dt className="text-[15px] font-semibold text-text-primary">{q}</dt>
              <dd className="text-[15px] leading-6 text-text-secondary">{a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-6 text-[13px] text-text-muted">
        <span>Built at NEAR HACKATHON.</span>
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          <Link className="hover:text-text-primary" href={NEAR_MINES_PATH}>Mines</Link>
          <a className="hover:text-text-primary" href="https://github.com/Iziedking/kova" target="_blank" rel="noreferrer">GitHub</a>
        </span>
      </footer>
    </Page>
    </>
  );
}

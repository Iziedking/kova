"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { GRID_CHIP, GRID_FACTORY, SQUARES, burnedTotal, formatUnits } from "@/adapters/near/grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/section";
import { NEAR_CHIP_PATH, NEAR_CLASSIC_PATH, NEAR_MINES_PATH, minePath } from "../paths";
import { useNow } from "../use-now";
import { usePoll } from "../use-poll";
import { MineBoard } from "./mine-board";
import { getGrid } from "./use-grid";
import { ExplorerLink, Page, Stat, mmss } from "./ui";

const STEPS = [
  "Pick a mine. Every coin has its own: CHIP has one, and so does every coin the factory accepts.",
  "Put coins on any of the 25 squares. You have 60 seconds.",
  "The contract picks one square at random, using NEAR's built-in random number. Kova does not choose it.",
  "If you are on that square, you get your coins back, a share of everyone else's, and fresh CHIP. 10% of the losing coins is burned.",
];

const QUESTIONS: { q: string; a: string }[] = [
  { q: "What is CHIP?", a: "Kova's own coin. You earn it by winning rounds in any mine. On testnet you can claim 1,000 free to start, and it has no value there." },
  { q: "Do I need a wallet?", a: "No. Sign in with email and Kova makes a NEAR account for you. You approve once; after that, staking CHIP never pops up a wallet. Other coins are a normal transfer, so each stake needs a confirmation." },
  { q: "Is this gambling?", a: "On mainnet it would be: a game of chance with real coins. Right now Kova runs on testnet with coins that have no value. If it goes to mainnet, only play with what you can afford to lose, and not where it isn't allowed." },
  { q: "Where did the idea come from?", a: "Kova's grid is based on ORE, a mining game on Solana. We rebuilt it on NEAR so every coin can have its own mine." },
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
    <Page className="space-y-16 pt-10 md:pt-14">
      <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <div>
          <h1 className="font-display text-[40px] font-bold leading-[1.05] tracking-[-0.03em] text-text-primary md:text-[60px]">Put your memecoin on a square. Every minute, one square wins.</h1>
          <p className="mt-5 max-w-[560px] text-[18px] leading-7 text-text-secondary">Kova is a mining game for NEAR memecoins. Coins on the losing squares go to the winners, and 10% of them is burned for good. The more people play, the less of the coin is left.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button href={chipMine ? minePath(chipMine.token) : NEAR_MINES_PATH} size="lg" iconRight={<ArrowRight size={16} />}>Start mining</Button>
            <Button href="#how" variant="secondary" size="lg">How a round works</Button>
          </div>
          <p className="mt-4 max-w-[560px] text-[13px] leading-5 text-text-muted">Testnet coins are free and worth nothing. If Kova goes to mainnet, mines will use real coins, so only play with what you can afford to lose.</p>
        </div>
        <div className="space-y-3" aria-label="The CHIP mine, live">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] text-text-muted">Live: the CHIP mine{cur.data ? `, round ${cur.data.id}` : ""}</p>
            <p className="num text-[22px] font-bold text-text-primary" aria-label={left === null ? "Loading" : `${left} seconds left`}>{left === null ? "–:––" : mmss(left)}</p>
          </div>
          <MineBoard totals={cur.data?.totals ?? empty} mine={empty} decimals={18} symbol="CHIP" selected={null} lastWinner={null} disabled onSelect={() => undefined} />
          <p className="num text-[12px] text-text-muted">{cur.data ? `${formatUnits(cur.data.total, 18)} CHIP from ${cur.data.players} player${cur.data.players === 1 ? "" : "s"} this round` : "Reading the chain…"}</p>
        </div>
      </section>

      <section aria-label="Kova in numbers" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Mines" value={mines.data ? String(mines.data.length) : "…"} />
        <Stat label="Rounds played" value={totals.data ? String(totals.data.rounds) : "…"} hint={totals.data ? `${totals.data.won} with a winner` : undefined} />
        <Stat label="CHIP burned in its mine" value={totals.data ? formatUnits(totals.data.burnedChipMine, 18) : "…"} />
        <Stat label="CHIP in circulation" value={chip.data ? formatUnits(chip.data.total_supply, 18, 0) : "…"} hint="All minted by playing" />
      </section>

      <section id="how" className="scroll-mt-24">
        <h2 className="font-display text-[28px] font-bold tracking-[-0.02em] text-text-primary">How a round works</h2>
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
          <h2 className="font-display text-[28px] font-bold tracking-[-0.02em] text-text-primary">Why a memecoin needs this</h2>
          <p className="mt-3 text-[16px] leading-7 text-text-secondary">Most memecoins have nothing to do after launch. A Kova mine gives holders a reason to come back every minute, and every round takes some of the coin out of circulation. A busy community makes its own coin scarcer.</p>
        </div>
        <div>
          <h2 className="font-display text-[28px] font-bold tracking-[-0.02em] text-text-primary">The Motherlode</h2>
          <p className="mt-3 text-[16px] leading-7 text-text-secondary">Every round with a winner adds a little CHIP to one jackpot shared by all the mines. Each such round has a 1 in {625} chance of paying the whole thing to that round&apos;s winners. It holds <span className="num font-semibold text-text-primary">{chip.data ? formatUnits(chip.data.motherlode, 18) : "…"}</span> CHIP right now.</p>
        </div>
      </section>

      <section>
        <h2 className="font-display text-[28px] font-bold tracking-[-0.02em] text-text-primary">The Foreman</h2>
        <p className="mt-3 max-w-[720px] text-[16px] leading-7 text-text-secondary">The Foreman is an account that mines next to you with a fixed rule, not an AI, and posts a recap of each round. You can check every post on chain, and read its keys: it can stake CHIP and post, and nothing else. <Link className="text-[#b79bff] underline" href={`${NEAR_MINES_PATH}#foreman`}>See its latest recaps.</Link></p>
      </section>

      <section>
        <h2 className="font-display text-[28px] font-bold tracking-[-0.02em] text-text-primary">Can you trust it?</h2>
        <div className="mt-3 grid gap-6 md:grid-cols-2">
          <p className="text-[16px] leading-7 text-text-secondary">Each mine is created with no access keys, so nobody, including us, can change its rules, pause it or move its coins. You can check that live on the <Link className="text-[#b79bff] underline" href={NEAR_CHIP_PATH}>CHIP page</Link>. On this testnet deployment the CHIP and factory accounts still hold a key; only the mines are locked.</p>
          <p className="text-[16px] leading-7 text-text-secondary">The winning square comes from NEAR&apos;s built-in random number. In theory a validator could nudge it by choosing whether to include a settle, which is why stakes are kept small. Someone has to call settle after each round; anyone can.</p>
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
          <Link className="hover:text-text-primary" href={NEAR_CLASSIC_PATH}>The original poker tables</Link>
        </span>
      </footer>
    </Page>
  );
}

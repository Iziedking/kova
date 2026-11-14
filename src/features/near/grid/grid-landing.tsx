"use client";

import { ArrowRight, Bot, Sparkle, ChevronDown, Clock, Coins, Dices, Flame, Hand, KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { GRID_CHIP, GRID_FACTORY, SQUARES, burnedTotal, formatUnits } from "@/adapters/near/grid";
import { Button } from "@/components/ui/button";
import { NEAR_CHIP_PATH, NEAR_MINES_PATH, minePath } from "../paths";
import { useNow } from "../use-now";
import { usePoll } from "../use-poll";
import { ForemanAiStatus } from "./foreman-panel";
import { MineBoard } from "./mine-board";
import { getGrid } from "./use-grid";
import { ExplorerLink, Page, SectionTitle, Stat, Tile, mmss } from "./ui";

const STEPS = [
  "Pick a coin. Each coin has its own mine.",
  "Stake on any of 25 squares in the first 50 seconds. In the CHIP mine the Foreman, our own account, then covers every empty square with 1 CHIP, so the round has a winner.",
  "NEAR's random number picks the winning square.",
  "Winners get their stake back, a share of the losers' coins, and new CHIP. 10% of the losers' coins is burned.",
];

const QUESTIONS: { q: string; a: string }[] = [
  { q: "What is a mine?", a: "A 5 by 5 grid for one coin. Every minute, one square wins." },
  { q: "How do I win?", a: "Stake on a square. If NEAR's random number picks it, you win your stake back plus a share of the losers' coins and new CHIP." },
  { q: "What happens to the losing coins?", a: "Winners share them. 10% is burned." },
  { q: "What if nobody is on the winning square?", a: "Every stake is returned and nothing is burned." },
  { q: "What is CHIP?", a: "Kova's own coin. Win rounds to earn it. On testnet you can claim 1,000 free." },
  { q: "Do I need a wallet?", a: "No. Sign in with email and Kova makes one for you. Approve once, then CHIP stakes need no popups. Other coins ask you to confirm each stake." },
  { q: "Can Kova take my coins?", a: "No. Mines have no access keys. Your game key can only stake CHIP and claim starter CHIP." },
  { q: "Can I add my coin?", a: "Yes, on the Open page, if the factory accepts it. Testnet accepts CHIP and JAMBO. Mainnet is planned, not built, and will accept meme.cooking tokens." },
  { q: "Is it on mainnet?", a: "No. Kova runs on NEAR testnet and the coins are worth nothing." },
  { q: "Where does the grid come from?", a: "The grid-and-minute round was first done by ORE on Solana. Kova adds a mine for every memecoin, burns the coin you play, opens mines from published code with no keys, and adds the Foreman." },
];

export function GridLanding() {
  const grid = getGrid();
  const now = useNow();
  const mines = usePoll(() => grid.mines(), 30_000, "mines");
  const chipMine = mines.data?.find((m) => m.token === GRID_CHIP) ?? null;
  const cur = usePoll(chipMine ? () => grid.currentRound(chipMine.mine) : null, 3_000, `cur:${chipMine?.mine}`);
  const last = usePoll(chipMine ? async () => (await grid.recent(chipMine.mine, 1))[0] ?? null : null, 10_000, `last:${chipMine?.mine}`);
  const lastResult = last.data ?? null;
  const chip = usePoll(() => grid.chipStats(), 8_000, "chip-stats");
  const chipCfg = usePoll(() => grid.chipConfig(), 60_000, "chip-config");
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
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent-line bg-accent-soft px-3 py-1 text-[13px] font-semibold text-[#c3a9ff]"><Sparkle size={14} aria-hidden="true" /> Mine memecoins on NEAR</p>
          <h1 className="font-display text-[40px] font-bold leading-[1.05] tracking-[-0.03em] text-text-primary md:text-[60px]">Every memecoin gets its own mine. Play a coin and it burns.</h1>
          <p className="mt-5 max-w-[560px] text-[18px] leading-7 text-text-secondary">Stake on a square. One square wins every minute. Losers pay winners, and 10% of the losing coins is burned, so playing a coin shrinks its supply.</p>
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
          <MineBoard totals={cur.data?.totals ?? empty} mine={empty} decimals={18} symbol="CHIP" selected={null} lastWinner={lastResult && lastResult.outcome === "settled" ? lastResult.winning_square : null} disabled onSelect={() => undefined} />
          <p className="num text-[12px] text-text-muted">{cur.data ? `${formatUnits(cur.data.total, 18)} CHIP from ${cur.data.players} player${cur.data.players === 1 ? "" : "s"}` : "Loading…"}</p>
          {lastResult ? (
            <p className="num text-[12px] leading-5 text-text-secondary">
              {lastResult.outcome === "settled" && lastResult.winning_square !== null
                ? `Last round ${lastResult.round}: square ${lastResult.winning_square + 1} won. ${formatUnits(lastResult.winners.reduce((n, w) => n + w.award, 0n), 18)} CHIP paid to ${lastResult.winners.length} winner${lastResult.winners.length === 1 ? "" : "s"}, ${formatUnits(lastResult.burned, 18)} CHIP burned.`
                : `Last round ${lastResult.round}: ${lastResult.winning_square === null ? "nobody was on the winning square" : "not settled in time"}, so every stake was returned.`}
            </p>
          ) : null}
        </div>
              </div>
      </section>
    <Page className="space-y-16 pt-10 md:pt-14">
      <p className="-mb-12 text-[13px] leading-5 text-text-muted">
        In any CHIP round a player joins, the Foreman, Kova&apos;s own account, puts 1 CHIP on every empty square so the round has a winner. The totals below include its stakes and burns.
      </p>
      <section aria-label="Kova in numbers" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Mines" value={mines.data ? String(mines.data.length) : "…"} />
        <Stat label="Rounds" value={totals.data ? String(totals.data.rounds) : "…"} hint={totals.data ? `${totals.data.won} with a winner` : undefined} />
        <Stat label="CHIP burned" value={totals.data ? formatUnits(totals.data.burnedChipMine, 18) : "…"} />
        <Stat label="CHIP in circulation" value={chip.data ? formatUnits(chip.data.total_supply, 18, 0) : "…"} hint="Minted by winning" />
      </section>

      <section id="how" className="scroll-mt-24">
        <SectionTitle label="Rounds" title="How it works" />
        <ol className="mt-5 grid gap-4 md:grid-cols-2">
          {STEPS.map((text, i) => (
            <li key={text} className="flex gap-4 rounded-xl border border-border-subtle bg-surface-2 p-5">
              <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent-line bg-accent-soft text-[14px] font-bold text-[#c3a9ff]">{i + 1}</span>
              <p className="text-[15px] leading-6 text-text-secondary">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-6">
        <SectionTitle label="Why mine" title="A reason to come back every minute" />
        <div className="grid gap-4 md:grid-cols-3">
          <Tile icon={<Clock size={20} />} title="Every minute">A new round starts every 60 seconds. One square wins.</Tile>
          <Tile icon={<Flame size={20} />} title="Every round burns">10% of the losing coins is burned for good.</Tile>
          <Tile icon={<Coins size={20} />} title="Winners earn CHIP">New CHIP goes to whoever wins a round.</Tile>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
        <div className="space-y-3">
          <SectionTitle label="The Hoard" title="One jackpot for every mine" />
          <p className="max-w-[460px] text-[16px] leading-7 text-text-secondary">It grows with every round that has a winner. Each of those rounds has a 1 in {chipCfg.data?.motherlode_odds ?? 625} chance to pay all of it out.</p>
        </div>
        <Tile title="The Hoard now" className="kova-orbit">
          <p className="num text-[44px] font-bold leading-none tracking-[-0.02em] text-text-primary">{chip.data ? formatUnits(chip.data.motherlode, 18) : "…"} <span className="text-[18px] font-medium text-text-muted">CHIP</span></p>
          {chip.data && chipCfg.data && chipCfg.data.motherlode_cap > 0n ? (
            <div className="mt-5">
              <div className="h-2 overflow-hidden rounded-full bg-surface-3" role="img" aria-label="The Hoard compared with its cap">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Number((chip.data.motherlode * 1000n) / chipCfg.data.motherlode_cap) / 10)}%` }} />
              </div>
              <p className="num mt-2 text-[12px] text-text-muted">Cap {formatUnits(chipCfg.data.motherlode_cap, 18, 0)} CHIP</p>
            </div>
          ) : null}
        </Tile>
      </section>

      <section className="space-y-6">
        <SectionTitle label="The Foreman" title="An agent mining beside you" />
        <div className="grid gap-4 md:grid-cols-3">
          <Tile icon={<Bot size={20} />} title="Recaps on chain" className="md:col-span-2">
            <p>While it runs, it stakes every round and posts a recap on chain. Recaps are plain templates for now; an AI remark from NEAR AI Cloud is added once an AI key is connected.</p>
            <ForemanAiStatus className="mt-3 text-[14px] leading-6 text-text-muted" />
            <Link className="mt-3 inline-flex items-center gap-1 font-semibold text-[#b79bff] hover:text-[#d0bdff]" href={`${NEAR_MINES_PATH}#foreman`}>Latest recaps <ArrowRight size={14} aria-hidden="true" /></Link>
          </Tile>
          <Tile icon={<KeyRound size={20} />} title="Limited keys">Its keys can only stake CHIP and post. They cannot move coins.</Tile>
        </div>
      </section>

      <section className="space-y-6">
        <SectionTitle label="Trust" title="Check it, do not trust us" />
        <div className="grid gap-4 md:grid-cols-3">
          <Tile icon={<ShieldCheck size={20} />} title="No admin keys">Mines have no access keys. Nobody can change them, pause them or move their coins. <Link className="text-[#b79bff] underline" href={NEAR_CHIP_PATH}>Check it live.</Link> On testnet, the CHIP and factory accounts still hold a key.</Tile>
          <Tile icon={<Dices size={20} />} title="Random from NEAR">The winner comes from NEAR&apos;s random number. A validator could nudge it, so stakes are capped.</Tile>
          <Tile icon={<Hand size={20} />} title="Anyone can settle">Any account can settle a round. It does not depend on us.</Tile>
        </div>
      </section>

      <section>
        <SectionTitle label="FAQ" title="Questions" />
        <div className="mt-4 divide-y divide-border-subtle rounded-xl border border-border-subtle">
          {QUESTIONS.map(({ q, a }) => (
            <details key={q} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold text-text-primary [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-text-muted transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-[15px] leading-6 text-text-secondary">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="space-y-3 border-t border-border-subtle pt-6 text-[13px] text-text-muted">
        <p>Contracts: <ExplorerLink href={grid.accountUrl(GRID_FACTORY)}>factory</ExplorerLink> · <ExplorerLink href={grid.accountUrl(GRID_CHIP)}>CHIP</ExplorerLink>{mines.data?.map((m) => <span key={m.mine}> · <ExplorerLink href={grid.accountUrl(m.mine)}>{m.token.split(".")[0]} mine</ExplorerLink></span>)}</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>Built at NEAR HACKATHON.</span>
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            <Link className="hover:text-text-primary" href={NEAR_MINES_PATH}>Mines</Link>
            <a className="hover:text-text-primary" href="https://github.com/Iziedking/kova" target="_blank" rel="noreferrer">GitHub</a>
          </span>
        </div>
      </footer>
    </Page>
    </>
  );
}

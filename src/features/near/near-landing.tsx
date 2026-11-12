"use client";

import { ArrowRight, ArrowUpRight, Coins, Flame, KeyRound, ShieldCheck, Swords, Timer, Trophy } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type ChipTable, formatChip } from "@/adapters/near/chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { CHIP_CONTRACT, HOUSE_ACCOUNT, nearNetwork, useNear } from "./near-session";
import { NEAR_PLAY_PATH, NEAR_TOKEN_PATH } from "./paths";
import { SupplyCounter } from "./supply-counter";
import { useNow } from "./use-now";
import { usePoll } from "./use-poll";

/** The three rules, as deployed. The token page reads the same values live from get_config. */
const RULES = [
  {
    icon: Flame,
    title: "The pot burns",
    body: "10% of every settled pot is burned on chain. Every round anyone plays shrinks CHIP's supply.",
    tone: "text-danger bg-danger-soft border-danger/25",
  },
  {
    icon: Timer,
    title: "The daily call",
    body: "Target: 30 settled tables a UTC day. Hit it and that day's players share 2,000 new CHIP. Miss it and 1% of the treasury burns.",
    tone: "text-[#c3a9ff] bg-accent-soft border-accent-line",
  },
  {
    icon: Coins,
    title: "Blinds",
    body: "Hold chips and sit out for 3 days, and you pay 1% a day to the treasury, never below 100 CHIP. Sitting out costs you.",
    tone: "text-warning bg-warning-soft border-warning/25",
  },
] as const;

const STEPS = [
  { icon: KeyRound, title: "Approve once", body: "Connect a NEAR testnet wallet. One approval adds a game key and gives you 1,000 CHIP. After that, playing needs no wallet popups." },
  { icon: Swords, title: "Pick and sit down", body: "Pick the coin on NEAR you think rises most, choose a stake and a 60-second round, and take the seat across from the House." },
  { icon: Trophy, title: "Showdown and burn", body: "The best % move takes the pot. The contract pays the winner and burns 10%, and the supply counter drops on screen." },
] as const;

function winnerLine(t: ChipTable): string {
  const winners = t.players.filter((p) => p.award > 0n);
  if (winners.length > 1) return "Tie, pot split";
  const w = winners[0];
  if (!w) return "Settled";
  return `${w.player === HOUSE_ACCOUNT ? "The House" : w.player} won ${formatChip(w.award)} CHIP`;
}

/** Live card beside the hero: supply, today's call and the latest showdown, all read from the contract. */
function NearHeroCard({ className }: { className?: string }) {
  const { chip } = useNear();
  const now = useNow();
  const stats = usePoll(() => chip.getStats(), 8_000, "landing:stats");
  const tables = usePoll(() => chip.getTables(undefined, 20), 15_000, "landing:tables");
  const house = usePoll(async () => (await (await fetch("/api/near/house")).json()) as { balance: string; sittingOut: boolean }, 30_000, "landing:house");

  const s = stats.data;
  const latest = tables.data?.find((t) => t.status === "Settled") ?? null;
  const left = 86_400 - (now % 86_400);
  const target = s?.daily_target_tables ?? 30;
  const done = s?.today_settled_tables ?? 0;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="rounded-card border border-border-subtle bg-surface-1/90 p-4 backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Badge tone="accent">CHIP</Badge>
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-dot" aria-hidden="true" />
              Live on NEAR testnet
            </span>
          </div>
          <Link href={NEAR_TOKEN_PATH} className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-text-primary hover:underline">
            Token page <ArrowUpRight size={14} className="text-text-muted" aria-hidden="true" />
          </Link>
        </div>
        <SupplyCounter supply={s?.total_supply ?? null} stale={stats.stale} size="md" />
        <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-border-subtle pt-3 text-[13px]">
          <div>
            <dt className="text-text-muted">Burned so far</dt>
            <dd className="num font-semibold text-text-primary">{s ? `${formatChip(s.total_burned)} CHIP` : "…"}</dd>
          </div>
          <div>
            <dt className="text-text-muted">House bankroll</dt>
            <dd className="num font-semibold text-text-primary">{house.data ? `${formatChip(BigInt(house.data.balance))} CHIP` : "…"}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-card border border-border-subtle bg-surface-1/90 p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[14px] font-semibold text-text-primary">Today&apos;s call</p>
          <span className="num text-[12px] text-text-muted">
            {Math.floor(left / 3600)}h {Math.floor((left % 3600) / 60)}m left
          </span>
        </div>
        <p className="num mt-1 text-[22px] font-bold text-text-primary">
          {s ? done : "…"} <span className="text-[14px] font-medium text-text-muted">/ {target} tables</span>
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label="Settled tables today against the target" aria-valuemin={0} aria-valuemax={target} aria-valuenow={done}>
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.min(100, (done / target) * 100)}%` }} />
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-card border border-border-subtle bg-surface-1/90 p-4 backdrop-blur-sm">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-danger/25 bg-danger-soft text-danger">
          <Flame size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          {latest ? (
            <>
              <p className="truncate text-[14px] font-semibold text-text-primary">
                Table {latest.id}: {winnerLine(latest)}
              </p>
              <p className="num text-[12px] text-text-secondary">That pot burned {formatChip(latest.burned)} CHIP.</p>
            </>
          ) : (
            <>
              <p className="text-[14px] font-semibold text-text-primary">The House is seated.</p>
              <p className="text-[12px] text-text-secondary">Take the other chair. The first pot burns the first CHIP.</p>
            </>
          )}
        </div>
        <Button href={NEAR_PLAY_PATH} size="sm" variant="secondary" iconRight={<ArrowRight size={14} />}>
          Play
        </Button>
      </div>
    </div>
  );
}

/** The NEAR landing: what CHIP is, the three rules, and one path into a round against the House. */
export function NearLanding() {
  return (
    <main className="bg-bg text-text-primary">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_85%_20%,rgba(124,77,255,0.20),transparent_70%),radial-gradient(40%_50%_at_0%_100%,rgba(124,77,255,0.10),transparent_70%)] [mask-image:linear-gradient(to_bottom,#000_65%,transparent)]"
        />
        <div className="relative mx-auto grid max-w-[var(--container-app)] grid-cols-1 items-center gap-10 px-4 pb-16 pt-12 md:px-8 md:pb-24 md:pt-20 lg:grid-cols-[55fr_45fr] lg:gap-14">
          <div className="min-w-0">
            <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.3em] text-text-muted">Stake&nbsp;&nbsp;/&nbsp;&nbsp;Pick&nbsp;&nbsp;/&nbsp;&nbsp;Burn</p>
            <h1 className="font-display text-[46px] font-bold leading-[0.98] tracking-[-0.045em] md:text-[72px] xl:text-[88px]">
              Poker with a
              <br />
              <span className="bg-linear-to-b from-[#cdb6ff] to-[#9b6cff] bg-clip-text text-transparent">chip that burns.</span>
            </h1>
            <p className="mt-6 max-w-[560px] text-[18px] leading-7 text-text-secondary md:text-[20px] md:leading-8">
              CHIP is a memecoin on NEAR that is also the poker chip. Pick the coin you think rises most, beat the House, and every pot burns part of the supply.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button href={NEAR_PLAY_PATH} size="lg" iconRight={<ArrowRight size={17} />}>
                Play the House
              </Button>
              <Button href="#how" size="lg" variant="secondary">
                See how it works
              </Button>
            </div>
            <p className="mt-5 text-[13px] text-text-muted">One wallet approval, then a 60-second round. NEAR testnet; CHIP has no value.</p>
          </div>

          <div className="relative min-h-[560px] min-w-0 md:min-h-[580px]">
            <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-0 h-[210px] w-[210px] -translate-x-1/2 opacity-80 md:left-auto md:right-6 md:h-[320px] md:w-[320px] md:translate-x-0">
              <Image src="/brand/kova-chip.jpg" alt="" width={760} height={760} priority className="h-full w-full object-contain mix-blend-screen [mask-image:radial-gradient(closest-side,#000_60%,transparent_100%)]" />
            </div>
            <NearHeroCard className="absolute inset-x-0 bottom-0" />
          </div>
        </div>
      </section>

      {/* The three rules */}
      <section aria-labelledby="rules-title" className="mx-auto max-w-[var(--container-app)] px-4 py-14 md:px-8">
        <h2 id="rules-title" className="font-display text-[32px] font-bold tracking-[-0.02em] md:text-[40px]">
          Three rules, all in the contract
        </h2>
        <p className="mb-8 mt-2 max-w-[640px] text-[16px] text-text-secondary">The meme is poker, and every rule behaves like poker. They were fixed at deploy, and the contract has no method to change them.</p>
        <div className="kova-stagger grid gap-4 md:grid-cols-3">
          {RULES.map((rule) => (
            <div key={rule.title} className="flex flex-col rounded-panel border border-border-subtle bg-surface-1 p-6 md:p-8">
              <span className={`grid h-12 w-12 place-items-center rounded-xl border ${rule.tone}`}>
                <rule.icon size={24} aria-hidden="true" />
              </span>
              <h3 className="mt-5 font-display text-[26px] font-bold leading-8">{rule.title}</h3>
              <p className="mt-2 text-[15px] leading-6 text-text-secondary">{rule.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How a round works */}
      <section id="how" aria-labelledby="how-title" className="mx-auto max-w-[var(--container-app)] scroll-mt-24 px-4 py-14 md:px-8">
        <h2 id="how-title" className="mb-8 font-display text-[32px] font-bold tracking-[-0.02em] md:text-[40px]">
          How a round works
        </h2>
        <ol className="kova-stagger grid gap-4 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="rounded-panel border border-border-subtle bg-surface-1 p-6">
              <div className="flex items-center gap-3">
                <span className="num grid h-8 w-8 place-items-center rounded-full border border-accent-line bg-accent-soft text-[13px] font-semibold text-[#c3a9ff]">{index + 1}</span>
                <step.icon size={20} className="text-text-secondary" aria-hidden="true" />
              </div>
              <h3 className="mt-4 font-display text-[22px] font-bold">{step.title}</h3>
              <p className="mt-1.5 text-[15px] leading-6 text-text-secondary">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Trust boundary */}
      <section aria-labelledby="trust-title" className="mx-auto max-w-[var(--container-app)] px-4 py-14 md:px-8">
        <div className="grid gap-6 rounded-panel border border-border-subtle bg-surface-1 p-6 md:grid-cols-[auto_1fr] md:p-8">
          <span className="grid h-12 w-12 place-items-center rounded-xl border border-success/25 bg-success-soft text-success">
            <ShieldCheck size={24} aria-hidden="true" />
          </span>
          <div>
            <h2 id="trust-title" className="font-display text-[26px] font-bold">What you can check, and what you trust</h2>
            <ul className="mt-3 space-y-2 text-[15px] leading-6 text-text-secondary">
              <li>
                Stakes, payouts, burns, the daily call and blinds all happen inside one NEP-141 contract,{" "}
                <a className="text-text-primary underline underline-offset-2" href={nearNetwork.explorerAccount(CHIP_CONTRACT)} target="_blank" rel="noreferrer">
                  {CHIP_CONTRACT}
                </a>
                , with no admin methods and no way to change a parameter. Its account still holds a full-access key, kept by the lead developer, which could deploy new code.
              </li>
              <li>The contract cannot see prices. A settler account reports each pick&apos;s start and end price from one fixed Rhea pool, so it decides who wins a table.</li>
              <li>If the settler stalls, every table becomes refundable by anyone after its deadline. Nothing burns on a refund.</li>
              <li>Prices are mainnet prices; CHIP is a testnet token with no value. This is a game, not an investment.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-[var(--container-app)] px-4 pb-20 pt-6 md:px-8">
        <div className="relative overflow-hidden rounded-panel border border-border-subtle bg-surface-1 px-6 py-12 text-center md:py-16">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_50%_120%,rgba(124,77,255,0.25),transparent_70%)]" />
          <h2 className="relative font-display text-[32px] font-bold tracking-[-0.02em] md:text-[44px]">Sit down. Burn some supply.</h2>
          <p className="relative mx-auto mt-3 max-w-[480px] text-[17px] text-text-secondary">The House is always seated. A round takes about two minutes, start to burn.</p>
          <div className="relative mt-7 flex flex-wrap justify-center gap-3">
            <Button href={NEAR_PLAY_PATH} size="lg" iconRight={<ArrowRight size={17} />}>
              Play the House
            </Button>
            <Button href={NEAR_TOKEN_PATH} size="lg" variant="secondary">
              See every burn
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border-subtle">
        <div className="mx-auto flex max-w-[var(--container-app)] flex-col gap-4 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-8">
          <p className="max-w-[520px] text-[13px] leading-5 text-text-muted">NEAR testnet. CHIP has no value and cannot be bought or sold here. Built for NEAR Hackathon.</p>
          <p className="text-[12px] uppercase tracking-[0.2em] text-text-muted">Built on NEAR · Prices from Rhea pools via DEX Screener</p>
        </div>
      </footer>
    </main>
  );
}

"use client";

import { ArrowUpRight, Flame, Lock, LockOpen, Sparkles } from "lucide-react";
import { formatChip } from "@/adapters/near/chip";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/section";
import { NearLeaderboard } from "./near-leaderboard";
import { CHIP_CONTRACT, nearNetwork, useNear } from "./near-session";
import { SimReplay } from "./sim-replay";
import { SupplyCounter } from "./supply-counter";
import { useNow } from "./use-now";
import { usePoll } from "./use-poll";

type LogEntry = { kind: "mint" | "burn"; amount: string; account: string | null; reason: string; at: string; txHash: string; explorerUrl: string };

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-2 p-4">
      <p className="text-[12px] text-text-muted">{label}</p>
      <p className="num mt-1 text-[20px] font-bold text-text-primary">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-text-muted">{hint}</p> : null}
    </div>
  );
}

const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;

export function TokenScreen() {
  const { chip, accountId } = useNear();
  const now = useNow();
  const stats = usePoll(() => chip.getStats(), 6_000, "stats");
  const config = usePoll(() => chip.getConfig(), 300_000, "config");
  const log = usePoll(async () => {
    const response = await fetch("/api/near/log");
    const body = (await response.json()) as { entries?: LogEntry[]; error?: { message: string } };
    if (!response.ok || !body.entries) throw new Error(body.error?.message ?? `HTTP ${response.status}`);
    return body.entries;
  }, 20_000, "log");
  const keys = usePoll(async () => {
    const list = (await chip.provider.viewAccessKeyList({ accountId: CHIP_CONTRACT })) as unknown as { keys: { access_key: { permission: unknown } }[] };
    return list.keys.filter((k) => k.access_key.permission === "FullAccess").length;
  }, 300_000, "keys");
  const days = usePoll(
    stats.data
      ? async () => {
          const s = stats.data!;
          const ids = Array.from({ length: 7 }, (_, i) => s.today - 1 - i).filter((d) => d >= s.launch_day);
          return Promise.all(ids.map(async (d) => ({ day: d, ...(await chip.getDay(d)) })));
        }
      : null,
    60_000,
    `days:${stats.data?.today ?? 0}`,
  );

  const s = stats.data;
  const c = config.data;
  const secondsLeft = 86_400 - (now % 86_400);

  return (
    <div className="mx-auto w-full max-w-[var(--container-app)] space-y-5 px-4 pb-16 pt-8 md:px-8">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-6">
          <SupplyCounter supply={s?.total_supply ?? null} stale={stats.stale} />
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Burned by pots" value={s ? formatChip(s.pot_burned, 0) : "…"} />
            <Stat label="Burned by missed days" value={s ? formatChip(s.daily_burned, 0) : "…"} />
            <Stat label="Minted by met days" value={s ? formatChip(s.total_minted, 0) : "…"} />
            <Stat label="Treasury" value={s ? formatChip(s.treasury, 0) : "…"} hint="Only the rules can move it" />
            <Stat label="Blinds collected" value={s ? formatChip(s.blinds_collected, 0) : "…"} />
            <Stat label="At tables now" value={s ? formatChip(s.escrow, 0) : "…"} />
            <Stat label="Tables settled" value={s ? String(s.tables_settled) : "…"} hint={s ? `${s.tables_refunded} refunded` : undefined} />
            <Stat label="Starter claims" value={s ? String(s.starters_claimed) : "…"} />
          </div>
        </Card>

        <Card className="p-6">
          <p className="text-[14px] font-semibold text-text-primary">Today&apos;s call</p>
          <p className="num mt-2 text-[32px] font-bold text-text-primary">
            {s ? s.today_settled_tables : "…"} <span className="text-[16px] font-medium text-text-muted">/ {s?.daily_target_tables ?? "…"} tables</span>
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label="Settled tables today against the target" aria-valuemin={0} aria-valuemax={s?.daily_target_tables ?? 30} aria-valuenow={s?.today_settled_tables ?? 0}>
            <div className="h-full rounded-full bg-accent" style={{ width: `${s ? Math.min(100, (s.today_settled_tables / s.daily_target_tables) * 100) : 0}%` }} />
          </div>
          <p className="num mt-2 text-[12px] text-text-muted">
            {s?.today_players ?? 0} players today · day closes in {Math.floor(secondsLeft / 3600)}h {Math.floor((secondsLeft % 3600) / 60)}m (00:00 UTC)
          </p>
          <ul className="mt-4 space-y-1.5 text-[13px]">
            {(days.data ?? []).map((d) => (
              <li key={d.day} className="flex items-center justify-between gap-2">
                <span className="num text-text-secondary">Day {d.day}</span>
                <span className="num text-text-muted">{d.settled_tables} tables</span>
                {!d.closed ? (
                  <Badge tone="outline">Not closed yet</Badge>
                ) : d.target_met ? (
                  <Badge tone="success" icon={<Sparkles size={12} />}>
                    +{formatChip(d.minted, 0)} minted
                  </Badge>
                ) : (
                  <Badge tone="danger" icon={<Flame size={12} />}>
                    {formatChip(d.burned, 0)} burned
                  </Badge>
                )}
              </li>
            ))}
            {days.data && days.data.length === 0 ? <li className="text-text-muted">The first day closes after midnight UTC.</li> : null}
          </ul>
        </Card>
      </div>

      <NearLeaderboard id="leaderboard" limit={20} viewer={accountId} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-[18px] font-bold text-text-primary">Every mint and burn</h2>
          <p className="mt-1 text-[12px] text-text-muted">From the contract&apos;s NEP-141 events, indexed by NearBlocks; reasons read from each transaction.</p>
          {log.error && !log.data ? <p className="mt-4 text-[13px] text-warning">Log unavailable: {log.error}</p> : null}
          <ul className="mt-4 divide-y divide-border-subtle">
            {(log.data ?? []).map((e) => (
              <li key={`${e.txHash}-${e.kind}-${e.amount}-${e.account}`} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-text-primary">{e.reason}</p>
                  <p className="num truncate text-[11px] text-text-muted">
                    {new Date(e.at).toISOString().replace("T", " ").slice(0, 19)} UTC{e.account && e.kind === "mint" ? ` · to ${e.account}` : ""}
                  </p>
                </div>
                <a className="num inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold hover:underline" href={e.explorerUrl} target="_blank" rel="noreferrer">
                  <span className={e.kind === "burn" ? "text-danger" : "text-success"}>
                    {e.kind === "burn" ? "-" : "+"}
                    {formatChip(BigInt(e.amount), 2)}
                  </span>
                  <ArrowUpRight size={12} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-[18px] font-bold text-text-primary">The rules, fixed at deploy</h2>
          <p className="mt-1 text-[12px] text-text-muted">
            Read from <code className="text-text-secondary">get_config</code> on{" "}
            <a className="underline" href={nearNetwork.explorerAccount(CHIP_CONTRACT)} target="_blank" rel="noreferrer">
              {CHIP_CONTRACT}
            </a>
            . The contract has no owner, no setter and no upgrade method.
          </p>
          {c ? (
            <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-text-secondary">Pot burn</dt>
              <dd className="num text-right font-semibold text-text-primary">{pct(c.pot_burn_bps)} of every settled pot</dd>
              <dt className="text-text-secondary">Daily target</dt>
              <dd className="num text-right font-semibold text-text-primary">{c.daily_target_tables} settled tables</dd>
              <dt className="text-text-secondary">Target met</dt>
              <dd className="num text-right font-semibold text-text-primary">{formatChip(c.daily_mint, 0)} CHIP minted, shared by the day&apos;s players</dd>
              <dt className="text-text-secondary">Target missed</dt>
              <dd className="num text-right font-semibold text-text-primary">{pct(c.daily_miss_burn_bps)} of the treasury burns</dd>
              <dt className="text-text-secondary">Blinds</dt>
              <dd className="num text-right font-semibold text-text-primary">
                {pct(c.blind_bps)} a day after {Math.round(c.blind_grace_seconds / 86_400)} idle days, never below {formatChip(c.blind_floor, 0)}
              </dd>
              <dt className="text-text-secondary">Starter claim</dt>
              <dd className="num text-right font-semibold text-text-primary">{formatChip(c.starter_amount, 0)} CHIP, once per account</dd>
              <dt className="text-text-secondary">Stakes</dt>
              <dd className="num text-right font-semibold text-text-primary">
                {formatChip(c.min_stake, 0)} to {formatChip(c.max_stake, 0)} CHIP
              </dd>
              <dt className="text-text-secondary">Settler</dt>
              <dd className="text-right font-semibold text-text-primary">{c.settler}</dd>
            </dl>
          ) : (
            <p className="mt-4 text-[13px] text-text-muted">{config.error ? `Could not read the rules: ${config.error}` : "Reading the rules…"}</p>
          )}
          <div className="mt-4 rounded-xl border border-border-subtle bg-surface-2 p-3 text-[12px] leading-5 text-text-secondary">
            {keys.data === null ? (
              "Checking the contract account's keys…"
            ) : keys.data === 0 ? (
              <span className="flex items-start gap-2">
                <Lock size={14} className="mt-0.5 shrink-0 text-success" aria-hidden="true" /> Locked: the contract account has no full-access key, so nobody can replace the code.
              </span>
            ) : (
              <span className="flex items-start gap-2">
                <LockOpen size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" /> Not locked yet: the contract account still has {keys.data} full-access key. Its owner could replace the code. The key is removed once testing ends.
              </span>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-[18px] font-bold text-text-primary">60 days, simulated</h2>
          <Badge tone="warning">Simulated, not live</Badge>
        </div>
        <p className="mt-1 max-w-[760px] text-[13px] text-text-secondary">
          The same rules run for 60 days in five communities. A busy community holds supply roughly flat; a quiet one loses about a third of it. Script and data:{" "}
          <code className="text-text-secondary">scripts/near/chip-simulation.ts</code>.
        </p>
        <div className="mt-4 rounded-xl border border-border-subtle bg-surface-2 p-4">
          <SimReplay />
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-[13px] font-medium text-text-secondary">All five scenarios in one chart</summary>
          {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG chart, not a photo */}
          <img src="/near/chip-supply.svg" alt="Simulated CHIP total supply and treasury over 60 days for five scenarios: busy community, quiet community, one whale, starter farmers, and most holders never playing." className="mt-3 w-full rounded-xl border border-border-subtle" width={760} height={670} />
        </details>
      </Card>
    </div>
  );
}

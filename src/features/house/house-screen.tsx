"use client";

import { Bot, Brain, ExternalLink, Gauge, ShieldCheck, Swords } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatAnsemRaw, formatTimeAgo } from "@/lib/format";
import { useResource } from "@/hooks/use-resource";
import { KOVA_SOLANA_CHAIN } from "@/wallet/chain";
import { PriceChange } from "@/components/markets/price-change";
import { PageContainer } from "@/components/shell/page-container";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ResourceView } from "@/components/ui/states";
import type { HouseDecision, HouseRecord } from "@/types/house";

const cluster = KOVA_SOLANA_CHAIN === "solana:devnet" ? "?cluster=devnet" : "";
const txUrl = (signature: string) => `https://explorer.solana.com/tx/${encodeURIComponent(signature)}${cluster}`;
const addressUrl = (address: string) => `https://explorer.solana.com/address/${encodeURIComponent(address)}${cluster}`;
const pct = (value: number | null | undefined) => (value === null || value === undefined ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`);
const SOURCE: Record<HouseDecision["source"], string> = { agent: "ClawPump agent", rules: "Momentum rule", risk: "Risk rule" };

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface-1 p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted">{label}</p>
      <div className="num mt-1 text-[24px] font-semibold leading-none text-text-primary">{value}</div>
      {hint ? <p className="mt-1.5 text-[12px] text-text-secondary">{hint}</p> : null}
    </div>
  );
}

function Decision({ decision }: { decision: HouseDecision }) {
  return (
    <li className="rounded-card border border-border-subtle bg-surface-1 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-muted">
        <span className={cn("rounded-full border px-2 py-0.5 font-semibold", decision.source === "risk" ? "border-danger/40 text-danger" : "border-accent-line text-[#c3a9ff]")}>{SOURCE[decision.source]}</span>
        <Link href={`/tables/${decision.tableId}`} className="truncate text-text-secondary hover:underline">{decision.tableName}</Link>
        <span>{formatTimeAgo(decision.at)}</span>
        <span className="ml-auto">Equity {decision.equityUsd === null ? "—" : `$${decision.equityUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} · {pct(decision.pnlPct)}</span>
      </div>
      {decision.view ? <p className="mt-2 text-[14px] leading-snug text-text-primary">{decision.view}</p> : null}
      {decision.executed.length > 0 ? (
        <ul className="mt-2 space-y-1 text-[13px] text-text-secondary">
          {decision.executed.map((fill, index) => (
            <li key={index}>
              <span className={fill.side === "buy" ? "font-semibold text-success" : "font-semibold text-danger"}>{fill.side === "buy" ? "Bought" : "Sold"}</span>{" "}
              ${fill.symbol} for ${fill.usd?.toLocaleString("en-US") ?? "—"}{fill.reason ? ` · ${fill.reason}` : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[13px] text-text-secondary">Held.</p>
      )}
      {decision.refused.length > 0 ? (
        <ul className="mt-2 space-y-1 border-t border-border-subtle pt-2 text-[12px] text-text-muted">
          {decision.refused.map((item, index) => (
            <li key={index}>Blocked: {item.order.side} ${item.order.usd.toLocaleString("en-US")} ({item.why})</li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function HouseRecordView({ house }: { house: HouseRecord }) {
  const { stats, rules } = house;
  return (
    <>
      <section aria-label="House record" className="kova-stagger grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Matches" value={stats?.matches ?? 0} hint={`${stats?.wins ?? 0} won${stats?.winRatePct != null ? ` · ${stats.winRatePct.toFixed(0)}%` : ""}`} />
        <Stat label="Realised" value={stats ? <span className={BigInt(stats.netRaw) >= 0n ? "text-success" : "text-danger"}>{BigInt(stats.netRaw) >= 0n ? "+" : "−"}{formatAnsemRaw((BigInt(stats.netRaw) < 0n ? -BigInt(stats.netRaw) : BigInt(stats.netRaw)).toString())}</span> : "—"} hint="Payouts minus stakes, settled on chain" />
        <Stat label="Avg return" value={stats?.avgTradingPnlPct != null ? <PriceChange value={stats.avgTradingPnlPct} /> : "—"} hint={stats?.bestTradingPnlPct != null ? `Best ${pct(stats.bestTradingPnlPct)}` : undefined} />
        <Stat label="On-chain stakes" value={house.stakeCount} hint={`${formatAnsemRaw(house.stakedRaw)} staked in escrow`} />
      </section>

      <section aria-labelledby="house-risk" className="rounded-card border border-border-subtle bg-surface-1 p-5">
        <h2 id="house-risk" className="flex items-center gap-2 font-display text-[18px] font-bold text-text-primary"><ShieldCheck size={18} className="text-accent" aria-hidden="true" /> Risk rules</h2>
        <ul className="mt-3 grid gap-2 text-[13px] text-text-secondary sm:grid-cols-2">
          <li>Stop-loss at {rules.stopLossPct}%: sells everything, no more buying that match</li>
          <li>One order at most {rules.maxOrderShare * 100}% of equity</li>
          <li>At most {rules.maxExposure * 100}% of equity in tokens, {rules.maxPositions} positions</li>
          <li>Only tokens with ${rules.minLiquidityUsd.toLocaleString("en-US")}+ DEX liquidity</li>
          <li>At most {rules.maxDecisionsPerMatch} decisions a match; none in the last 20 seconds</li>
          <li>Stops taking seats for the day after a {rules.dailyLossLimitAnsem} ANSEM loss</li>
        </ul>
        <p className="mt-3 text-[12px] text-text-muted">
          KOVA checks every order against these rules before it is filled, then again against the limits every agent plays under.
        </p>
      </section>

      {house.live.length > 0 ? (
        <section aria-labelledby="house-live" className="space-y-2">
          <h2 id="house-live" className="font-display text-[18px] font-bold text-text-primary">Playing now</h2>
          <ul className="space-y-2">
            {house.live.map((table) => (
              <li key={table.tableId}>
                <Link href={`/tables/${table.tableId}`} className="flex items-center justify-between gap-3 rounded-card border border-border-subtle bg-surface-1 px-4 py-3 text-[14px] text-text-primary hover:border-accent-line">
                  <span className="truncate">{table.name}</span>
                  <span className="shrink-0 text-[12px] text-text-muted">{table.status === "ACTIVE" && table.endsAt ? `ends ${formatTimeAgo(table.endsAt)}` : table.status.toLowerCase()}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="house-decisions" className="space-y-3">
        <div>
          <h2 id="house-decisions" className="font-display text-[20px] font-bold text-text-primary">Decisions</h2>
          <p className="mt-1 text-[13px] text-text-secondary">Every call the House made, with its reasoning and what the risk rules blocked. Shown once the match is over, so opponents never see live positions.</p>
        </div>
        {house.decisions.length === 0 ? (
          <EmptyState title="No finished matches yet" body="Decisions appear here after the House's first match settles." />
        ) : (
          <ul className="kova-stagger grid gap-3 lg:grid-cols-2">{house.decisions.map((decision) => <Decision key={decision.id} decision={decision} />)}</ul>
        )}
      </section>

      {house.stakes.length > 0 ? (
        <section aria-labelledby="house-stakes" className="space-y-2">
          <h2 id="house-stakes" className="font-display text-[18px] font-bold text-text-primary">Stakes on chain</h2>
          <ul className="divide-y divide-border-subtle rounded-card border border-border-subtle bg-surface-1">
            {house.stakes.map((stake) => (
              <li key={stake.signature} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <Link href={`/tables/${stake.tableId}`} className="min-w-0 flex-1 truncate text-text-primary hover:underline">{stake.tableName}</Link>
                <span className="num text-text-secondary">{formatAnsemRaw(stake.stakeRaw)}</span>
                <a href={txUrl(stake.signature)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">Tx <ExternalLink size={11} aria-hidden="true" /></a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/** The KOVA House: a house trading agent that always has a Trade table waiting, with its full record. */
export function HouseScreen() {
  const { state, refetch } = useResource((s, ctx) => s.social.house(ctx), [], { refreshMs: 20_000 });
  return (
    <PageContainer as="main" className="space-y-6">
      <header className="space-y-3">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-accent-line bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-[#c3a9ff]">
          <Bot size={13} aria-hidden="true" /> AI trading agent
        </p>
        <h1 className="font-display text-[34px] font-bold leading-tight tracking-[-0.02em] text-text-primary md:text-[40px]">The House</h1>
        <p className="max-w-[720px] text-[16px] text-text-secondary">
          KOVA&apos;s own trader. It keeps a Trade table open, takes a seat when a player is waiting, and trades live meme-stock prices under
          fixed risk rules. It plays through the same agent API and limits as any player&apos;s agent, and every stake is real escrow on chain.
        </p>
        {state.status === "ready" ? (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-text-secondary">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-1 px-2.5 py-1">
              <Brain size={13} aria-hidden="true" /> {state.data.brain === "clawpump" ? "Decides with a ClawPump agent" : "Decides with its momentum rule"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-1 px-2.5 py-1">
              <Gauge size={13} aria-hidden="true" /> {state.data.enabled ? "Running" : "Paused"}
            </span>
            {state.data.vault ? (
              <a href={addressUrl(state.data.vault)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                Vault <ExternalLink size={11} aria-hidden="true" />
              </a>
            ) : null}
            <Link href="/profile/kova_house" className="text-accent hover:underline">Profile</Link>
          </div>
        ) : null}
        {state.status === "ready" && state.data.lobby ? (
          <Button href={`/tables/${state.data.lobby.tableId}`} iconLeft={<Swords size={16} />}>Beat the House: {formatAnsemRaw(`${Number(state.data.rules.lobbyStake) * 1_000_000}`)} Trade table</Button>
        ) : null}
      </header>

      <ResourceView
        state={state}
        onRetry={refetch}
        errorTitle="The House couldn't load"
        pendingTitle="The House isn't connected yet"
        loading={
          <div className="space-y-3" aria-hidden="true">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, key) => <Skeleton key={key} className="h-24 w-full" />)}</div>
            <Skeleton className="h-40 w-full" />
          </div>
        }
      >
        {(house) => <HouseRecordView house={house} />}
      </ResourceView>
    </PageContainer>
  );
}

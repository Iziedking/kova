"use client";

import { ShieldCheck, ShieldX, ShieldQuestion, ExternalLink } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatTimeAgo } from "@/lib/format";
import { useResource } from "@/hooks/use-resource";
import { KOVA_SOLANA_CHAIN } from "@/wallet/chain";
import { AssetAvatar } from "@/components/markets/asset-avatar";
import { PageContainer } from "@/components/shell/page-container";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ResourceView } from "@/components/ui/states";
import type { DealerDesk, DealerVerdictItem } from "@/types/social";

const pct = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);

function tokenUrl(mint: string): string {
  const cluster = KOVA_SOLANA_CHAIN === "solana:devnet" ? "?cluster=devnet" : "";
  return `https://explorer.solana.com/address/${encodeURIComponent(mint)}${cluster}`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface-1 p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted">{label}</p>
      <p className="num mt-1 text-[26px] font-semibold leading-none text-text-primary">{value}</p>
      {hint ? <p className="mt-1.5 text-[12px] text-text-secondary">{hint}</p> : null}
    </div>
  );
}

const VERDICT = {
  ACCEPTED: { label: "Admitted", icon: ShieldCheck, tone: "text-success border-success/40 bg-success/10" },
  REJECTED: { label: "Refused", icon: ShieldX, tone: "text-danger border-danger/40 bg-danger/10" },
  INSUFFICIENT_EVIDENCE: { label: "Not enough evidence", icon: ShieldQuestion, tone: "text-text-secondary border-border-strong bg-surface-2" },
} as const;

function VerdictRow({ verdict }: { verdict: DealerVerdictItem }) {
  const style = VERDICT[verdict.decision];
  const Icon = style.icon;
  const label = verdict.symbol ?? `${verdict.mint.slice(0, 4)}…${verdict.mint.slice(-4)}`;
  return (
    <li className="rounded-card border border-border-subtle bg-surface-1 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <AssetAvatar symbol={label} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-text-primary">${label}</p>
          <p className="truncate text-[12px] text-text-secondary">{verdict.name ?? verdict.mint}</p>
        </div>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold", style.tone)}>
          <Icon size={13} aria-hidden="true" /> {style.label}
        </span>
      </div>
      {verdict.reasons.length > 0 ? (
        <ul className="mt-3 space-y-1 text-[13px] leading-snug text-text-secondary">
          {verdict.reasons.map((reason) => <li key={reason} className="break-words">{reason}</li>)}
        </ul>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-subtle pt-3 text-[12px] text-text-muted">
        <span>Confidence <span className="num text-text-primary">{pct(verdict.confidence)}</span></span>
        <span>{verdict.source === "admission" ? "At the table lock" : "Pick check"}</span>
        <span>{formatTimeAgo(verdict.at)}</span>
        {verdict.evidenceHash ? <span className="num break-all" title="SHA-256 of the evidence the Dealer was given">Evidence {verdict.evidenceHash.slice(0, 12)}…</span> : null}
        <span className="ml-auto flex items-center gap-3">
          {verdict.tableId ? <Link href={`/tables/${verdict.tableId}`} className="text-accent hover:underline">Table</Link> : null}
          <a href={tokenUrl(verdict.mint)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
            Token <ExternalLink size={11} aria-hidden="true" />
          </a>
        </span>
      </div>
    </li>
  );
}

function Desk({ desk }: { desk: DealerDesk }) {
  const { stats } = desk;
  return (
    <>
      <section aria-label="Dealer totals" className="kova-stagger grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Tokens judged" value={String(stats.runs)} hint={`${stats.distinctTokens} different tokens`} />
        <Stat label="Admitted" value={String(stats.accepted)} hint={`${pct(stats.admitRate)} admit rate`} />
        <Stat label="Refused" value={String(stats.refused)} hint="Includes not enough evidence" />
        <Stat label="Last 24 hours" value={String(stats.last24hRuns)} hint={`Avg confidence ${pct(stats.avgConfidence)}`} />
      </section>

      <section aria-labelledby="verdicts-title" className="space-y-3">
        <div>
          <h2 id="verdicts-title" className="font-display text-[20px] font-bold text-text-primary">Latest verdicts</h2>
          <p className="mt-1 text-[13px] text-text-secondary">
            Refusals appear straight away. An admitted pick stays sealed until its table is over, so this page never gives away a live pick.
          </p>
        </div>
        {desk.verdicts.length === 0 ? (
          <EmptyState title="No published verdicts yet" body="Verdicts show up here as players check picks and tables finish." />
        ) : (
          <ul className="kova-stagger grid gap-3 lg:grid-cols-2">
            {desk.verdicts.map((verdict) => <VerdictRow key={verdict.id} verdict={verdict} />)}
          </ul>
        )}
      </section>
    </>
  );
}

/**
 * The Dealer desk: the ClawPump agent that decides which tokens may be played, and its record.
 * Every number here comes from the backend's decision log.
 */
export function DealerScreen() {
  const { state, refetch } = useResource((s, ctx) => s.social.dealerDesk(ctx), [], { refreshMs: 30_000 });
  return (
    <PageContainer as="main" className="space-y-6">
      <header className="space-y-2">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-accent-line bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-[#c3a9ff]">
          <ShieldCheck size={13} aria-hidden="true" /> AI agent on ClawPump
        </p>
        <h1 className="font-display text-[34px] font-bold leading-tight tracking-[-0.02em] text-text-primary md:text-[40px]">The Dealer</h1>
        <p className="max-w-[680px] text-[16px] text-text-secondary">
          Every pick on KOVA goes past the Dealer first. It reads the token&apos;s mint on chain and its live DEX markets, then admits it or refuses it
          with its reasons. KOVA checks the Dealer&apos;s answer before it counts, and only an admitted pick can be staked.
        </p>
      </header>

      <ResourceView
        state={state}
        onRetry={refetch}
        errorTitle="The Dealer desk couldn't load"
        pendingTitle="The Dealer desk isn't connected yet"
        loading={
          <div className="space-y-3" aria-hidden="true">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, key) => <Skeleton key={key} className="h-24 w-full" />)}</div>
            {Array.from({ length: 4 }, (_, key) => <Skeleton key={key} className="h-32 w-full" />)}
          </div>
        }
      >
        {(desk) => <Desk desk={desk} />}
      </ResourceView>
    </PageContainer>
  );
}

"use client";

import { ChevronLeft, ExternalLink, Flame, Swords, Trophy } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { formatAge, formatTimeAgo, formatUsd, formatUsdPrice, shortAddress } from "@/lib/format";
import { useResource } from "@/hooks/use-resource";
import { PriceChart } from "@/components/trading/price-chart";
import { TimeframeTabs } from "@/components/trading/timeframe-tabs";
import { PompSourceBadge } from "@/components/markets/pomp-source-badge";
import { PageContainer } from "@/components/shell/page-container";
import { Button } from "@/components/ui/button";
import { ResponsiveOverlay } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineNotice, ResourceView } from "@/components/ui/states";
import { Card } from "@/components/ui/section";
import { AssetHeader } from "@/features/trading/asset-header";
import type { MarketAsset, Timeframe } from "@/types/market";
import { cn } from "@/lib/cn";

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  const id = useId();
  return (
    <Card as="section" className={cn("p-5", className)}>
      <h2 id={id} className="mb-4 font-display text-[18px] font-bold text-text-primary">{title}</h2>
      <div aria-labelledby={id}>{children}</div>
    </Card>
  );
}

function Facts({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3.5">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[12px] text-text-secondary">{label}</dt>
          <dd className="num mt-0.5 truncate text-[14px] font-medium text-text-primary">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PlaySheet({ asset, open, onOpenChange }: { asset: MarketAsset; open: boolean; onOpenChange: (open: boolean) => void }) {
  const market = encodeURIComponent(asset.mint);
  const options = [
    {
      key: "predict",
      title: "Predict",
      body: `Lock $${asset.symbol} as a secret pick. Best % move wins.`,
      href: `/play?mode=prediction&intent=create&market=${market}`,
      icon: <Trophy size={20} aria-hidden="true" />,
      disabled: !asset.eligibility.prediction,
    },
    {
      key: "trade",
      title: "Trade",
      body: `Trade $${asset.symbol} with real capital in a timed match.`,
      href: `/play?mode=trading&intent=create&market=${market}`,
      icon: <Flame size={20} aria-hidden="true" />,
      disabled: !asset.eligibility.trading,
    },
    {
      key: "challenge",
      title: "Challenge a player",
      body: "Pick a rival and send a direct challenge.",
      href: "/leaderboard",
      icon: <Swords size={20} aria-hidden="true" />,
      disabled: false,
    },
  ];
  return (
    <ResponsiveOverlay open={open} onOpenChange={onOpenChange} title={`Play $${asset.symbol}`} description="Choose how you want to play this market.">
      <ul className="space-y-2.5">
        {options.map((option) => (
          <li key={option.key}>
            <Link
              href={option.href}
              aria-disabled={option.disabled || undefined}
              tabIndex={option.disabled ? -1 : undefined}
              onClick={() => !option.disabled && onOpenChange(false)}
              className={cn(
                "flex items-center gap-4 rounded-card border border-border-subtle bg-surface-2 p-4 transition-colors hover:border-accent-line hover:bg-accent-soft/40",
                option.disabled && "pointer-events-none opacity-45",
              )}
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">{option.icon}</span>
              <span>
                <span className="block text-[16px] font-semibold text-text-primary">{option.title}</span>
                <span className="block text-[13px] text-text-secondary">{option.disabled ? asset.eligibility.reason ?? "Not available for this market." : option.body}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </ResponsiveOverlay>
  );
}

function RecentActivity({ mint }: { mint: string }) {
  const { state, refetch } = useResource((s) => s.markets.recentTrades(mint), [mint], { refreshMs: 15_000 });
  return (
    <ResourceView
      state={state}
      compact
      onRetry={refetch}
      pendingTitle="Market activity isn't connected yet"
      loading={<Skeleton className="h-32 w-full" />}
      isEmpty={(rows) => rows.length === 0}
      empty={<p className="text-[14px] text-text-secondary">No recent activity.</p>}
    >
      {(rows) => (
        <ul className="divide-y divide-border-subtle">
          {rows.slice(0, 6).map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
              <span className={row.side === "buy" ? "font-medium text-success" : "font-medium text-danger"}>{row.side === "buy" ? "Buy" : "Sell"}</span>
              <span className="num text-text-primary">{formatUsdPrice(row.priceUsd)}</span>
              <span className="num text-text-secondary">{formatUsd(row.totalUsd, { compact: row.totalUsd >= 10000 })}</span>
              <span className="text-text-muted">{formatTimeAgo(row.time)}</span>
            </li>
          ))}
        </ul>
      )}
    </ResourceView>
  );
}

function Detail({ asset }: { asset: MarketAsset }) {
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [playOpen, setPlayOpen] = useState(false);
  const candles = useResource((s) => s.markets.candles(asset.mint, timeframe), [asset.mint, timeframe], { refreshMs: 20_000 });
  const explorer = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(asset.mint) ? `https://solscan.io/token/${asset.mint}` : null;

  return (
    <div className="space-y-6">
      <Link href="/markets" className="inline-flex items-center gap-1 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary">
        <ChevronLeft size={15} aria-hidden="true" /> Markets
      </Link>

      <Card as="section" className="p-5 md:p-6">
        <AssetHeader asset={asset} />
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <TimeframeTabs value={timeframe} onChange={setTimeframe} />
          <Button size="lg" iconLeft={<Trophy size={17} />} onClick={() => setPlayOpen(true)} disabled={!asset.eligibility.prediction && !asset.eligibility.trading} className="max-md:w-full">
            Play this market
          </Button>
        </div>
        <div className="mt-3">
          <ResourceView
            state={candles.state}
            compact
            onRetry={candles.refetch}
            errorTitle="Price history couldn't load"
            pendingTitle="Price history isn't connected yet"
            loading={<Skeleton className="h-[320px] w-full" />}
          >
            {(data) => <PriceChart candles={data} timeframe={timeframe} symbol={asset.symbol} height={360} />}
          </ResourceView>
        </div>
      </Card>

      {!asset.eligibility.prediction && !asset.eligibility.trading ? (
        <InlineNotice tone="warning">{asset.eligibility.reason ?? "This market isn't eligible for Kova tables right now."}</InlineNotice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Market overview">
          <Facts
            rows={[
              ["Liquidity", asset.liquidityUsd == null ? "—" : formatUsd(asset.liquidityUsd, { compact: true })],
              ["24h volume", asset.volume24hUsd == null ? "—" : formatUsd(asset.volume24hUsd, { compact: true })],
              ["Age", formatAge(asset.ageSeconds)],
              ["Source", asset.source === "clawpump / pump.fun" ? <PompSourceBadge label="ClawPump / pump.fun" /> : "Market data"],
              [
                "Contract",
                explorer ? (
                  <a href={explorer} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-[#b79bff] underline underline-offset-2">
                    {shortAddress(asset.mint)} <ExternalLink size={12} aria-hidden="true" />
                  </a>
                ) : (
                  shortAddress(asset.mint)
                ),
              ],
            ]}
          />
        </Panel>

        <Panel title="Kova activity">
          <p className="num text-[32px] font-semibold leading-9 text-text-primary">{asset.kovaActivityCount ?? "—"}</p>
          <p className="mt-1 text-[14px] text-text-secondary">
            {asset.kovaActivityCount == null ? "Match activity isn't available for this market yet." : "recent Kova matches involving this market"}
          </p>
          <Button href="/play" variant="secondary" size="sm" className="mt-4">Find a table</Button>
        </Panel>

        {asset.narrative || asset.underlyingTicker ? (
          <Panel title="Meme / stock context">
            <Facts rows={[["Narrative", asset.narrative ?? "—"], ["Underlying stock", asset.underlyingTicker ?? "—"]]} />
          </Panel>
        ) : null}

        <Panel title="Recent market activity">
          <RecentActivity mint={asset.mint} />
        </Panel>
      </div>

      <PlaySheet asset={asset} open={playOpen} onOpenChange={setPlayOpen} />
    </div>
  );
}

/** `/markets/[mint]`: what is this, what's happening, why care, how do I play it (blueprint 25). */
export function MarketDetailScreen({ mint }: { mint: string }) {
  const { state, refetch } = useResource((s) => s.markets.getByMint(mint), [mint], { refreshMs: 10_000 });
  return (
    <PageContainer as="main">
      <ResourceView
        state={state}
        onRetry={refetch}
        errorTitle="This market isn't available"
        pendingTitle="Market details aren't connected yet"
        loading={
          <div className="space-y-5" aria-hidden="true">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-64 w-full" />
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          </div>
        }
      >
        {(asset) => <Detail asset={asset} />}
      </ResourceView>
    </PageContainer>
  );
}

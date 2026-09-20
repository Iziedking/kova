"use client";

import { ChevronLeft, LayoutList } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatAnsemRaw } from "@/lib/format";
import { useCountdown } from "@/hooks/use-now";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useResource } from "@/hooks/use-resource";
import { DealerMessage } from "@/components/dealer/dealer-message";
import { ModeBadge } from "@/components/play/mode-badge";
import { PriceChart, type TradeMarker } from "@/components/trading/price-chart";
import { CompetitionStrip } from "@/components/trading/competition-strip";
import { MiniLeaderboard } from "@/components/trading/mini-leaderboard";
import { PositionSummary } from "@/components/trading/position-summary";
import { TimeframeTabs } from "@/components/trading/timeframe-tabs";
import { TradeTicket } from "@/components/trading/trade-ticket";
import { Button } from "@/components/ui/button";
import { BottomSheet, Drawer } from "@/components/ui/overlay";
import { InlineNotice, ResourceView } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/skeleton";
import type { TableDetail } from "@/types/competition";
import type { MarketAsset, Timeframe } from "@/types/market";
import type { TradeSide, TradingMatchState } from "@/types/trading";
import { AssetHeader } from "./asset-header";
import { DuelPanel } from "./duel-panel";
import { MarketRail } from "./market-rail";
import { TradeConfirmation } from "./trade-confirmation";
import { TradesPanel } from "./trades-panel";
import { useTradeFlow } from "./use-trade-flow";

function ChartSkeleton({ height }: { height: number }) {
  return <Skeleton className="w-full rounded-card" aria-hidden="true" {...{ style: { height } }} />;
}

interface LayoutProps {
  table: TableDetail;
  readAt: number;
  match: TradingMatchState;
  refetchMatch: () => void;
}

/**
 * The live Trading match (blueprint 14-23). Real-money trading: every number in
 * the ticket comes from the backend and the lifecycle is reported stage by stage.
 *
 * Desktop (>=1280): market rail | chart + asset | match + trade rail.
 * Laptop (1024-1279): the rail becomes a drawer.
 * Mobile: a different composition - sticky competition strip, asset, chart,
 * position, details, and a sticky Buy / Sell bar that opens the trade sheet.
 */
function MatchLayout({ table, readAt, match, refetchMatch }: LayoutProps) {
  const lg = useMediaQuery("(min-width: 1024px)");
  const xl = useMediaQuery("(min-width: 1280px)");
  const [activeMint, setActiveMint] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [side, setSide] = useState<TradeSide>("buy");
  const [railOpen, setRailOpen] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [standingsOpen, setStandingsOpen] = useState(false);

  const mint = activeMint ?? match.eligibleMints[0] ?? null;
  const asset = useResource((s) => s.markets.getByMint(mint as string), [mint], { enabled: mint !== null, refreshMs: 5_000 });
  const candles = useResource((s) => s.markets.candles(mint as string, timeframe), [mint, timeframe], { enabled: mint !== null, refreshMs: 15_000 });
  const flow = useTradeFlow(refetchMatch);

  const seconds = useCountdown(table.endsAt, table.serverTime, readAt);
  const closed = table.status === "settling" || seconds === 0;

  const assetData: MarketAsset | null = asset.state.status === "ready" ? asset.state.data : null;
  const position = match.positions.find((entry) => entry.assetMint === mint) ?? null;
  const viewerRow = table.standings?.find((row) => row.isViewer) ?? null;
  const rank = viewerRow?.rank ?? null;
  const dealerNote = table.dealer[0] ?? null;

  const markers = useMemo<TradeMarker[]>(
    () =>
      match.trades
        .filter((trade) => trade.assetMint === mint && trade.status === "confirmed" && trade.effectivePriceUsd !== null)
        .map((trade) => ({ time: Math.floor(Date.parse(trade.confirmedAt ?? trade.createdAt) / 1000), side: trade.side, priceUsd: trade.effectivePriceUsd as number })),
    [match.trades, mint],
  );

  const execution: "live" | "unavailable" = closed ? "unavailable" : match.execution;
  const executionNote = closed ? "Trading is closed while the match settles." : match.executionNote;
  const balanceUsd = match.balance?.availableUsd ?? null;
  const ticketProps = assetData
    ? {
        tableId: table.id,
        asset: assetData,
        side,
        onSideChange: setSide,
        balanceUsd,
        positionValueUsd: position?.currentValueUsd ?? null,
        execution,
        executionNote,
        onReview: (quote: Parameters<typeof flow.review>[0], source: Parameters<typeof flow.review>[1]) => {
          setTradeOpen(false);
          flow.review(quote, source);
        },
      }
    : null;

  const chartHeight = xl ? 440 : lg ? 380 : 280;
  const chart = candles.state.status === "ready" && mint ? (
    <PriceChart candles={candles.state.data} timeframe={timeframe} symbol={assetData?.symbol ?? ""} height={chartHeight} markers={markers} averageEntryUsd={position?.averageEntryUsd ?? null} />
  ) : (
    <ResourceView
      state={candles.state}
      compact
      onRetry={candles.refetch}
      errorTitle="Price history couldn't load"
      pendingTitle="Price history isn't connected yet"
      loading={<ChartSkeleton height={chartHeight} />}
    >
      {() => null}
    </ResourceView>
  );

  const railFallback = <Skeleton className="h-64 w-full" />;
  const rail = mint ? (
    <MarketRail activeMint={mint} eligibleMints={match.eligibleMints} onSelect={(next) => { setActiveMint(next); setRailOpen(false); }} className="h-full" />
  ) : (
    railFallback
  );

  return (
    <div className="space-y-4">
      {closed ? <InlineNotice tone="info">The match has ended and is settling. Trading is closed; your final PnL % decides the pot.</InlineNotice> : null}

      {/* ---------- Desktop / laptop ---------- */}
      {lg ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[260px_minmax(0,1fr)_360px]">
          {xl ? <aside aria-label="Markets" className="sticky top-[calc(var(--spacing-header)+16px)] h-[calc(100dvh-var(--spacing-header)-32px)] self-start">{rail}</aside> : null}

          <div className="min-w-0 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] text-text-secondary">
                <Link href="/play" className="inline-flex items-center gap-1 hover:text-text-primary"><ChevronLeft size={14} aria-hidden="true" /> Play</Link>
                <span aria-hidden="true">/</span>
                <span className="truncate text-text-primary">{table.name}</span>
                <ModeBadge mode="trading" className="ml-1" />
              </nav>
              {!xl ? (
                <Button size="sm" variant="secondary" iconLeft={<LayoutList size={15} />} onClick={() => setRailOpen(true)}>Markets</Button>
              ) : null}
            </div>

            <div className="rounded-panel border border-border-subtle bg-surface-1 p-5">
              {assetData ? <AssetHeader asset={assetData} /> : <ResourceView state={asset.state} compact onRetry={asset.refetch} pendingTitle="Market data isn't connected yet" loading={<Skeleton className="h-24 w-full" />}>{() => null}</ResourceView>}
              <div className="mt-5 flex items-center justify-between gap-3">
                <TimeframeTabs value={timeframe} onChange={setTimeframe} />
                <span className="text-[12px] text-text-muted">Chart timeframe · not the match clock</span>
              </div>
              <div className="mt-3">{chart}</div>
            </div>

            <TradesPanel trades={match.trades} asset={assetData} activity={table.activity} dealer={table.dealer} />
          </div>

          <aside aria-label="Match and trade" className="space-y-4 lg:sticky lg:top-[calc(var(--spacing-header)+16px)] lg:self-start">
            <DuelPanel table={table} standings={table.standings} readAt={readAt} />
            {ticketProps ? <TradeTicket {...ticketProps} /> : <Skeleton className="h-80 w-full" />}
            <PositionSummary position={position} symbol={assetData?.symbol ?? ""} />
            {dealerNote ? (
              <div className="rounded-card border border-accent-line bg-accent-soft/50 p-4">
                <DealerMessage message={dealerNote} />
              </div>
            ) : null}
          </aside>
        </div>
      ) : (
        /* ---------- Mobile ---------- */
        <div className="space-y-4 pb-24">
          <div className="sticky top-[var(--spacing-mobile-header)] z-30 -mx-4 bg-bg/95 px-4 pb-2 pt-2 backdrop-blur-md">
            <CompetitionStrip rank={rank} pnlPct={match.totalPnlPct} endsAt={table.endsAt} serverTime={table.serverTime} readAt={readAt} potRaw={table.potAnsemRaw} onOpen={() => setStandingsOpen(true)} />
          </div>

          {assetData ? <AssetHeader asset={assetData} compact /> : <Skeleton className="h-20 w-full" />}
          <div className="-mx-1">{chart}</div>
          <div className="overflow-x-auto scrollbar-none">
            <TimeframeTabs value={timeframe} onChange={setTimeframe} />
          </div>
          <PositionSummary position={position} symbol={assetData?.symbol ?? ""} compact />
          <TradesPanel trades={match.trades} asset={assetData} activity={table.activity} dealer={table.dealer} />
          {dealerNote ? (
            <div className="rounded-card border border-accent-line bg-accent-soft/50 p-4">
              <DealerMessage message={dealerNote} />
            </div>
          ) : null}

          {/* Sticky Buy / Sell, above the bottom navigation. */}
          <div className="fixed inset-x-0 bottom-[calc(var(--spacing-bottom-nav)+env(safe-area-inset-bottom))] z-30 grid grid-cols-2 gap-3 border-t border-border-subtle bg-bg/95 px-4 py-3 backdrop-blur-md">
            <Button variant="success" size="lg" disabled={closed} onClick={() => { setSide("buy"); setTradeOpen(true); }}>Buy</Button>
            <Button variant="danger" size="lg" disabled={closed || !position} onClick={() => { setSide("sell"); setTradeOpen(true); }}>Sell</Button>
          </div>

          <BottomSheet open={tradeOpen} onOpenChange={setTradeOpen} title={`Trade ${assetData?.symbol ?? ""}`} showTitle={false} className="max-h-[92dvh]">
            {ticketProps ? <TradeTicket {...ticketProps} className="border-0 bg-transparent p-0" /> : null}
          </BottomSheet>
          <BottomSheet open={standingsOpen} onOpenChange={setStandingsOpen} title="Live standings" description={`Ranked by net PnL %. Pot ${formatAnsemRaw(table.potAnsemRaw)}.`}>
            <MiniLeaderboard standings={table.standings} />
          </BottomSheet>
        </div>
      )}

      {!xl && lg ? (
        <Drawer open={railOpen} onOpenChange={setRailOpen} title="Markets" showTitle={false} className="max-w-[360px]">
          <div className="h-[calc(100dvh-96px)]">{rail}</div>
        </Drawer>
      ) : null}

      <TradeConfirmation
        flow={flow}
        onRefreshQuote={() => {
          flow.reset();
        }}
      />
    </div>
  );
}

/**
 * Entry point for an active or settling Trading table. Trading Mode needs backend
 * capabilities that are not live yet (competition ledger, quotes, execution); when
 * the match state is unavailable this says so instead of drawing a fake trading floor.
 */
export function TradingMatch({ table, readAt }: { table: TableDetail; readAt: number }) {
  const { state, refetch } = useResource((s) => s.trading.matchState(table.id), [table.id], { refreshMs: 5_000 });

  return (
    <ResourceView
      state={state}
      onRetry={refetch}
      errorTitle="The trading floor couldn't load"
      pendingTitle="Trading Mode isn't live yet"
      loading={
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]" aria-hidden="true">
          <Skeleton className="h-[520px] w-full" />
          <Skeleton className="h-[520px] w-full" />
        </div>
      }
    >
      {(match) => <MatchLayout table={table} readAt={readAt} match={match} refetchMatch={refetch} />}
    </ResourceView>
  );
}



"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import { formatAge, formatCompact, formatTimeAgo, formatUsd, formatUsdPrice } from "@/lib/format";
import { useResource } from "@/hooks/use-resource";
import { ExecutionRow } from "@/components/trading/execution-row";
import { EmptyState, ResourceView } from "@/components/ui/states";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import type { TableActivityItem } from "@/types/competition";
import type { DealerMessageItem } from "@/types/competition";
import type { MarketAsset } from "@/types/market";
import type { Trade } from "@/types/trading";

type PanelTab = "trades" | "market" | "activity";

function MarketStats({ asset }: { asset: MarketAsset }) {
  const rows: Array<[string, string]> = [
    ["Liquidity", asset.liquidityUsd == null ? "—" : formatUsd(asset.liquidityUsd, { compact: true })],
    ["24h volume", asset.volume24hUsd == null ? "—" : formatUsd(asset.volume24hUsd, { compact: true })],
    ["Age", formatAge(asset.ageSeconds)],
    ["Underlying", asset.underlyingTicker ?? "—"],
    ["Source", asset.source === "clawpump / pump.fun" ? "ClawPump / pump.fun" : "Market data"],
    ["Contract", asset.mint.length > 14 ? `${asset.mint.slice(0, 6)}…${asset.mint.slice(-4)}` : asset.mint],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-[12px] text-text-secondary">{label}</dt>
          <dd className="num mt-0.5 text-[14px] font-medium text-text-primary">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RecentMarketTrades({ mint }: { mint: string }) {
  const { state, refetch } = useResource((s) => s.markets.recentTrades(mint), [mint], { refreshMs: 8_000 });
  return (
    <ResourceView
      state={state}
      compact
      onRetry={refetch}
      pendingTitle="Market trades aren't connected yet"
      loading={<Skeleton className="h-32 w-full" />}
      isEmpty={(rows) => rows.length === 0}
      empty={<EmptyState compact title="No recent trades" />}
    >
      {(rows) => (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.06em] text-text-muted">
                <th className="pb-2 pr-3 font-medium">Time</th>
                <th className="pb-2 pr-3 font-medium">Price</th>
                <th className="pb-2 pr-3 font-medium">Amount</th>
                <th className="pb-2 pr-3 font-medium">Total</th>
                <th className="pb-2 text-right font-medium">Side</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map((row) => (
                <tr key={row.id} className="border-t border-border-subtle text-[13px]">
                  <td className="num py-2 pr-3 text-text-secondary">{new Date(row.time).toLocaleTimeString("en-US", { hour12: false })}</td>
                  <td className={cn("num py-2 pr-3", row.side === "buy" ? "text-success" : "text-danger")}>{formatUsdPrice(row.priceUsd)}</td>
                  <td className="num py-2 pr-3 text-text-primary">{formatCompact(row.amount)}</td>
                  <td className="num py-2 pr-3 text-text-primary">{formatUsd(row.totalUsd, { compact: row.totalUsd >= 10000 })}</td>
                  <td className={cn("py-2 text-right font-medium", row.side === "buy" ? "text-success" : "text-danger")}>{row.side === "buy" ? "Buy" : "Sell"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ResourceView>
  );
}

/**
 * Below the chart (blueprint 22): Your trades, Market, Activity. No holder
 * leaderboard, wallet clusters or order-book mimic.
 */
export function TradesPanel({
  trades,
  asset,
  activity,
  dealer,
  className,
}: {
  trades: Trade[];
  asset: MarketAsset | null;
  activity: TableActivityItem[];
  dealer: DealerMessageItem[];
  className?: string;
}) {
  const [tab, setTab] = useState<PanelTab>("trades");
  const idBase = useId();

  return (
    <section aria-label="Match details" className={cn("rounded-panel border border-border-subtle bg-surface-1 p-4", className)}>
      <Tabs
        idBase={idBase}
        label="Match details"
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "trades", label: "Your trades", count: trades.length },
          { value: "market", label: "Market" },
          { value: "activity", label: "Activity" },
        ]}
      />
      <div className="pt-4">
        <TabPanel idBase={idBase} value="trades" active={tab === "trades"}>
          {trades.length === 0 ? (
            <EmptyState compact title="No trades yet" body="Your executions appear here once they're confirmed onchain." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[460px] text-left">
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.06em] text-text-muted">
                    <th className="pb-2 pr-3 font-medium">Time</th>
                    <th className="pb-2 pr-3 font-medium">Side</th>
                    <th className="pb-2 pr-3 font-medium">Amount</th>
                    <th className="pb-2 pr-3 font-medium">Price</th>
                    <th className="pb-2 pr-3 font-medium">Fee</th>
                    <th className="pb-2 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade) => (
                    <ExecutionRow key={trade.id} trade={trade} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabPanel>

        <TabPanel idBase={idBase} value="market" active={tab === "market"} className="space-y-5">
          {asset ? <MarketStats asset={asset} /> : <Skeleton className="h-20 w-full" />}
          {asset ? (
            <div>
              <h3 className="mb-2 text-[13px] font-semibold text-text-primary">Recent market trades</h3>
              <RecentMarketTrades mint={asset.mint} />
            </div>
          ) : null}
        </TabPanel>

        <TabPanel idBase={idBase} value="activity" active={tab === "activity"}>
          {activity.length === 0 && dealer.length === 0 ? (
            <EmptyState compact title="Quiet so far" body="Joins, confirmed trades and Dealer notes show up here." />
          ) : (
            <ul className="space-y-3">
              {dealer.slice(0, 2).map((message) => (
                <li key={message.id} className="text-[14px] text-text-primary">
                  <span className="mr-2 text-[12px] font-semibold text-[#b79bff]">Dealer</span>
                  {message.text}
                </li>
              ))}
              {activity.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 text-[14px] text-text-primary">
                  <span>{item.text}</span>
                  <span className="shrink-0 text-[12px] text-text-muted">{formatTimeAgo(item.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </TabPanel>
      </div>
    </section>
  );
}

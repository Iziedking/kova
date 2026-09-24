"use client";

import { ArrowDownToLine, ArrowUpFromLine, Check, Copy, Eye, EyeOff, Search, ShieldCheck, Trophy, TrendingUp, Wallet } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { DIRECTION_TEXT, directionOf, formatPct, formatSignedUsd, formatUsd, shortAddress } from "@/lib/format";
import { useViewer } from "@/features/auth/viewer";
import { useResource } from "@/hooks/use-resource";
import { ActivityRow } from "@/components/portfolio/activity-row";
import { CompetitionAllocation } from "@/components/portfolio/competition-allocation";
import { HoldingRow, HoldingsHeader } from "@/components/portfolio/holding-row";
import { PortfolioChart } from "@/components/portfolio/portfolio-chart";
import { PageContainer } from "@/components/shell/page-container";
import { Button } from "@/components/ui/button";
import { ResponsiveOverlay } from "@/components/ui/overlay";
import { Card, SectionHeader } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, InlineNotice, ResourceView } from "@/components/ui/states";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import type { PortfolioHolding, PortfolioSummary, PortfolioWindow } from "@/types/portfolio";

const WINDOWS: PortfolioWindow[] = ["1H", "1D", "1W", "1M", "1Y", "ALL"];
type HoldingTab = "all" | PortfolioHolding["kind"];

function StatCard({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string }) {
  return (
    <div className="flex items-center gap-4 rounded-card border border-border-subtle bg-surface-1 p-4">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">{icon}</span>
      <div className="min-w-0">
        <p className="text-[13px] text-text-secondary">{label}</p>
        <p className={cn("num truncate text-[22px] font-semibold leading-7 text-text-primary", tone)}>{value}</p>
        {sub ? <p className="num truncate text-[12px] text-text-secondary">{sub}</p> : null}
      </div>
    </div>
  );
}

function DepositSheet({ address, open, onOpenChange }: { address: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy. Select the address and copy it manually.");
    }
  }
  return (
    <ResponsiveOverlay open={open} onOpenChange={onOpenChange} title="Deposit" description="Send Solana assets to your connected wallet.">
      {address ? (
        <div className="space-y-4">
          <div className="rounded-card border border-border-subtle bg-surface-2 p-4">
            <p className="text-[12px] text-text-secondary">Your Solana wallet address</p>
            <p className="num mt-1 break-all text-[14px] text-text-primary">{address}</p>
          </div>
          <Button block variant="secondary" iconLeft={copied ? <Check size={16} /> : <Copy size={16} />} onClick={() => void copy()}>
            {copied ? "Copied" : "Copy address"}
          </Button>
          <InlineNotice tone="warning">Only send assets on the Solana network. Funds sent on another network are lost.</InlineNotice>
        </div>
      ) : (
        <EmptyState compact title="Connect a wallet first" body="Your deposit address is your connected Solana wallet." />
      )}
    </ResponsiveOverlay>
  );
}

function Summary({ data, window, onWindow }: { data: PortfolioSummary; window: PortfolioWindow; onWindow: (w: PortfolioWindow) => void }) {
  const viewer = useViewer();
  const idBase = useId();
  const [hidden, setHidden] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [tab, setTab] = useState<HoldingTab>("all");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

  const address = data.wallet.address ?? viewer.walletAddress;
  const holdings = useMemo(
    () =>
      data.holdings.filter(
        (holding) => (tab === "all" || holding.kind === tab) && (!search.trim() || `${holding.name} ${holding.symbol}`.toLowerCase().includes(search.trim().toLowerCase())),
      ),
    [data.holdings, tab, search],
  );
  const changeDir = directionOf(data.change24hPct);
  const pnlDir = directionOf(data.totalPnlUsd);
  const mask = (value: string) => (hidden ? "••••••" : value);

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy the address.");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0 space-y-6">
        <Card as="section" className="p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
                Total Portfolio Value
                <button type="button" onClick={() => setHidden((value) => !value)} aria-label={hidden ? "Show balances" : "Hide balances"} aria-pressed={hidden} className="text-text-secondary transition-colors hover:text-text-primary">
                  {hidden ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              </div>
              <p className="num mt-2 text-[40px] font-bold leading-[44px] text-text-primary md:text-[44px]">{mask(formatUsd(data.totalValueUsd, { cents: true }))}</p>
              <p className={cn("num mt-1 text-[15px]", DIRECTION_TEXT[changeDir])}>
                {mask(formatSignedUsd(data.change24hUsd))} <span className="ml-1 font-medium">{formatPct(data.change24hPct, { digits: 2 })}</span> <span className="text-text-secondary">(24h)</span>
              </p>
            </div>
            <Tabs
              variant="pill"
              label="Chart window"
              value={window}
              onValueChange={onWindow}
              items={WINDOWS.map((w) => ({ value: w, label: w }))}
            />
          </div>
          <PortfolioChart points={data.history} hidden={hidden} className="mt-4" />
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={<Wallet size={22} />} label="Available Balance" value={mask(formatUsd(data.availableUsd))} sub={data.totalValueUsd && data.availableUsd ? `${((data.availableUsd / data.totalValueUsd) * 100).toFixed(1)}% of portfolio` : undefined} />
          <StatCard icon={<Trophy size={22} />} label="In Competitions" value={mask(formatUsd(data.inCompetitionsUsd))} sub={data.totalValueUsd && data.inCompetitionsUsd ? `${((data.inCompetitionsUsd / data.totalValueUsd) * 100).toFixed(1)}% of portfolio` : undefined} />
          <StatCard icon={<TrendingUp size={22} />} label="Total PnL" value={mask(formatSignedUsd(data.totalPnlUsd))} tone={DIRECTION_TEXT[pnlDir]} sub={`${formatPct(data.totalPnlPct, { digits: 1 })} all time`} />
          <StatCard icon={<ShieldCheck size={22} />} label="Wallet Status" value={<span className={data.wallet.connected ? "text-success" : "text-warning"}>{data.wallet.connected ? "Connected" : "Not connected"}</span>} />
        </div>

        <Card as="section" className="pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3">
            <h2 className="font-display text-[20px] font-bold text-text-primary">Your Holdings <span className="num text-[16px] font-medium text-text-secondary">({data.holdings.length})</span></h2>
            <div className="flex h-10 w-full items-center gap-2 rounded-input border border-border-strong bg-surface-2 px-3 sm:w-64">
              <Search size={15} className="text-text-muted" aria-hidden="true" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search assets…" aria-label="Search assets" className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-text-primary outline-none placeholder:text-text-muted" />
            </div>
          </div>
          <div className="px-5">
            <Tabs
              idBase={idBase}
              label="Holdings filter"
              value={tab}
              onValueChange={setTab}
              items={[
                { value: "all", label: "All Assets" },
                { value: "crypto", label: "Crypto" },
                { value: "stock", label: "Stocks" },
                { value: "kova", label: "Kova" },
              ]}
            />
          </div>
          <TabPanel idBase={idBase} value={tab} active className="pt-3">
            {holdings.length === 0 ? (
              <div className="p-5"><EmptyState compact title={search ? "No assets match your search" : "Nothing here yet"} /></div>
            ) : (
              <div role="table" aria-label="Holdings" className={hidden ? "blur-sm" : undefined}>
                <HoldingsHeader />
                <div role="rowgroup">
                  {holdings.map((holding) => (
                    <HoldingRow key={holding.mint} holding={holding} />
                  ))}
                </div>
              </div>
            )}
          </TabPanel>
        </Card>
      </div>

      <aside aria-label="Wallet and activity" className="space-y-5">
        <Card as="section" className="p-5">
          <SectionHeader title="Wallet" className="mb-3" />
          <div className="flex items-center gap-3 rounded-card border border-border-subtle bg-surface-2 p-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Wallet size={20} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-text-primary">{data.wallet.provider ?? "Solana wallet"}</p>
              {address ? (
                <button type="button" onClick={() => void copyAddress()} className="num inline-flex items-center gap-1.5 text-[13px] text-text-secondary transition-colors hover:text-text-primary" aria-label="Copy wallet address">
                  {shortAddress(address)} {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                </button>
              ) : (
                <p className="text-[13px] text-text-secondary">No wallet linked</p>
              )}
            </div>
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium", data.wallet.connected ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
              {data.wallet.connected ? "Connected" : "Not connected"}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Button variant="secondary" iconLeft={<ArrowDownToLine size={16} />} onClick={() => (address ? setDepositOpen(true) : viewer.actions.connectWallet())}>Deposit</Button>
            <Button variant="secondary" iconLeft={<ArrowUpFromLine size={16} />} disabled title="Sending isn't connected yet">Send</Button>
          </div>
          <p className="mt-2 text-[12px] text-text-muted">Sending from Kova needs wallet signing, which isn&apos;t enabled yet.</p>
        </Card>

        <Card as="section" className="p-5">
          <SectionHeader title="Competition Positions" className="mb-1" />
          {data.allocations.length === 0 ? (
            <EmptyState compact title="No active matches" body="Capital tied to a live match shows up here." />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {data.allocations.map((allocation) => (
                <CompetitionAllocation key={allocation.tableId} allocation={allocation} />
              ))}
            </ul>
          )}
        </Card>

        <Card as="section" className="p-5">
          <SectionHeader title="Recent Activity" className="mb-1" />
          {data.activity.length === 0 ? (
            <EmptyState compact title="No confirmed activity yet" />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {data.activity.map((item) => (
                <ActivityRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </Card>
      </aside>

      <DepositSheet address={address} open={depositOpen} onOpenChange={setDepositOpen} />
    </div>
  );
}

/**
 * Portfolio (blueprint 29): a trustworthy account surface for real capital, not a
 * social dashboard. Everything comes from the backend's portfolio source; it is
 * never derived from unrelated wallet events in the browser.
 */
export function PortfolioScreen() {
  const [window, setWindow] = useState<PortfolioWindow>("1D");
  const { state, refetch } = useResource((s) => s.portfolio.summary(window), [window], { refreshMs: 30_000 });

  return (
    <PageContainer as="main" className="space-y-6">
      <header className="max-w-[640px]">
        <h1 className="font-display text-[38px] font-bold leading-[42px] tracking-[-0.02em] text-text-primary md:text-[52px] md:leading-[56px]">
          Your <span className="bg-linear-to-b from-[#cdb6ff] to-[#9b6cff] bg-clip-text text-transparent">Portfolio</span>
        </h1>
        <p className="mt-2 text-[16px] leading-6 text-text-secondary">Track your assets, match positions, and performance across markets and competitions, all in one place.</p>
      </header>
      <ResourceView
        state={state}
        onRetry={refetch}
        errorTitle="Your portfolio couldn't load"
        pendingTitle="Portfolio data isn't connected yet"
        loading={
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_400px]" aria-hidden="true">
            <div className="space-y-6">
              <Skeleton className="h-72 w-full" />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-24 w-full" />)}
              </div>
              <Skeleton className="h-80 w-full" />
            </div>
            <div className="space-y-5">
              <Skeleton className="h-44 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          </div>
        }
      >
        {(data) => <Summary data={data} window={window} onWindow={setWindow} />}
      </ResourceView>
    </PageContainer>
  );
}

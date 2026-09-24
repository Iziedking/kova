"use client";

import { ArrowRight, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { formatPct, formatUsd, formatUsdPrice } from "@/lib/format";
import { useTradeQuote } from "@/features/trading/use-trade-flow";
import { useRequireWallet } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { InlineNotice } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { PriceChange } from "@/components/markets/price-change";
import type { MarketAsset } from "@/types/market";
import type { DraftOrder, TradeQuote, TradeSide } from "@/types/trading";
import type { DataSource } from "@/types/service";

const BUY_CHIPS = [25, 100, 250, 500] as const;
const SELL_CHIPS = [25, 50, 75] as const;

function Row({ label, value, hint }: { label: React.ReactNode; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[14px]">
      <dt className="flex items-center gap-1.5 text-text-secondary">
        {label}
        {hint ? <Info size={13} className="text-text-muted" aria-label={hint} /> : null}
      </dt>
      <dd className="num text-text-primary">{value}</dd>
    </div>
  );
}

/**
 * The Buy/Sell ticket (blueprint 19). Amount is a US$ value; quick chips are
 * fixed dollars for a buy and a share of the position for a sell. The
 * estimate rows are the backend's quote, shown verbatim. The primary action only
 * opens review: nothing is sent from here. A wallet is required to review,
 * because a real trade moves real money.
 */
export function TradeTicket({
  tableId,
  asset,
  side,
  onSideChange,
  balanceUsd,
  positionValueUsd,
  execution,
  executionNote,
  onReview,
  className,
}: {
  tableId: string;
  asset: MarketAsset;
  side: TradeSide;
  onSideChange: (side: TradeSide) => void;
  balanceUsd: number | null;
  positionValueUsd: number | null;
  execution: "live" | "unavailable";
  executionNote: string | null;
  onReview: (quote: TradeQuote, source: DataSource | null) => void;
  className?: string;
}) {
  const requireWallet = useRequireWallet();
  const [amount, setAmount] = useState("100");
  const value = Number(amount);
  const validNumber = amount !== "" && Number.isFinite(value) && value > 0;
  const limit = side === "buy" ? balanceUsd : positionValueUsd;
  const overLimit = validNumber && limit !== null && value > limit + 1e-9;

  const order = useMemo<DraftOrder | null>(
    () =>
      validNumber && !overLimit && execution === "live"
        ? { tableId, assetMint: asset.mint, symbol: asset.symbol, side, inputUsd: value }
        : null,
    [validNumber, overLimit, execution, tableId, asset.mint, asset.symbol, side, value],
  );
  const quote = useTradeQuote(order);

  const chips = side === "buy" ? BUY_CHIPS.map((usd) => ({ label: `$${usd}`, usd })) : SELL_CHIPS.map((pct) => ({ label: `${pct}%`, usd: positionValueUsd === null ? null : (positionValueUsd * pct) / 100 }));
  const setMax = () => {
    if (limit !== null) setAmount(String(Math.floor(limit * 100) / 100));
  };

  const cta = side === "buy" ? "Review buy" : "Review sell";
  const disabled = execution !== "live" || !validNumber || overLimit || quote.status !== "ready";

  function review() {
    if (quote.status !== "ready" || !quote.quote) return;
    const ready = quote.quote;
    const source = quote.source;
    requireWallet(`A real ${side} moves real money, so it needs your Solana wallet.`, () => onReview(ready, source));
  }

  return (
    <section aria-label={`Trade ${asset.symbol}`} className={cn("rounded-panel border border-border-subtle bg-surface-1 p-4", className)}>
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-display text-[18px] font-bold text-text-primary">Trade {asset.symbol}</h3>
        <span className="flex items-baseline gap-2">
          <span className="num text-[14px] text-text-primary">{formatUsdPrice(asset.priceUsd)}</span>
          <PriceChange value={asset.change24hPct} className="text-[13px]" />
        </span>
      </div>

      <Tabs
        variant="segmented"
        fill
        label="Buy or sell"
        value={side}
        onValueChange={(next) => {
          onSideChange(next);
          setAmount(next === "buy" ? "100" : "");
        }}
        items={[
          { value: "buy", label: "Buy" },
          { value: "sell", label: "Sell", disabled: positionValueUsd === null || positionValueUsd <= 0 },
        ]}
        className={cn(
          side === "buy" ? "[&_[aria-selected=true]]:bg-success-soft [&_[aria-selected=true]]:text-success [&_[aria-selected=true]]:shadow-[inset_0_0_0_1px_rgba(50,214,154,0.35)]" : "[&_[aria-selected=true]]:bg-danger-soft [&_[aria-selected=true]]:text-danger [&_[aria-selected=true]]:shadow-[inset_0_0_0_1px_rgba(255,92,120,0.35)]",
        )}
      />

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[13px]">
          <label htmlFor="trade-amount" className="font-semibold text-text-primary">Amount (US$)</label>
          <span className="num text-text-secondary">{side === "buy" ? "Balance" : "Position"}: {formatUsd(limit)}</span>
        </div>
        <div
          className={cn(
            "flex h-12 items-center gap-2 rounded-input border bg-surface-2 px-3.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25",
            overLimit ? "border-danger/70" : "border-border-strong",
          )}
        >
          <span className="text-text-secondary" aria-hidden="true">$</span>
          <input
            id="trade-amount"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(event) => {
              const next = event.target.value.replace(/[^0-9.]/g, "");
              if (/^\d*\.?\d{0,2}$/.test(next)) setAmount(next);
            }}
            aria-invalid={overLimit || undefined}
            aria-describedby={overLimit ? "trade-amount-error" : undefined}
            className="num h-full min-w-0 flex-1 bg-transparent text-[18px] font-medium text-text-primary outline-none"
          />
        </div>
        {overLimit ? (
          <p id="trade-amount-error" role="alert" className="mt-1.5 text-[13px] text-danger">
            {side === "buy" ? "That's more than your available balance." : "That's more than your position is worth."}
          </p>
        ) : null}

        <div className="mt-2.5 grid grid-cols-5 gap-2" role="group" aria-label="Quick amounts">
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              disabled={chip.usd === null}
              onClick={() => chip.usd !== null && setAmount(String(Math.floor(chip.usd * 100) / 100))}
              className="num h-9 rounded-lg border border-border-strong bg-surface-2 text-[13px] text-text-primary transition-colors hover:border-[#454858] disabled:opacity-40"
            >
              {chip.label}
            </button>
          ))}
          <button type="button" onClick={setMax} disabled={limit === null} className="h-9 rounded-lg border border-border-strong bg-surface-2 text-[13px] font-medium text-text-primary transition-colors hover:border-[#454858] disabled:opacity-40">
            MAX
          </button>
        </div>
      </div>

      <dl className="mt-4 divide-y divide-border-subtle border-t border-border-subtle pt-2">
        <Row label={side === "buy" ? "Est. Quantity" : "Est. Proceeds"} value={quote.status === "ready" && quote.quote ? `${quote.quote.estimatedOutputAmount} ${quote.quote.outputSymbol}` : "—"} />
        <Row label="Estimated Cost" value={quote.status === "ready" && quote.quote ? formatUsd(Number(quote.quote.inputAmount), { cents: true }) : validNumber ? formatUsd(value, { cents: true }) : "—"} />
        <Row label="Price Impact" hint="How far your order moves the price" value={quote.status === "ready" && quote.quote?.priceImpactPct != null ? `~${formatPct(quote.quote.priceImpactPct, { digits: 2, signed: false })}` : "—"} />
        <Row label="Fees" value={quote.status === "ready" && quote.quote ? formatUsd(quote.quote.feeUsd, { cents: true }) : "—"} />
      </dl>

      {execution === "unavailable" ? (
        <InlineNotice tone="warning" className="mt-3">{executionNote ?? "Real trade execution isn't live yet, so nothing can be sent."}</InlineNotice>
      ) : quote.status === "pending" || quote.status === "error" ? (
        <InlineNotice tone={quote.status === "pending" ? "warning" : "danger"} className="mt-3">{quote.message}</InlineNotice>
      ) : quote.source === "fixture" ? (
        <p className="mt-3 text-[12px] text-text-muted">Sample quote — no real trade is sent.</p>
      ) : null}

      <Button
        className="mt-4"
        block
        size="lg"
        variant="primary"
        disabled={disabled}
        loading={quote.status === "loading" && validNumber && !overLimit}
        loadingLabel="Getting quote…"
        iconRight={<ArrowRight size={17} />}
        onClick={review}
      >
        {cta}
      </Button>
    </section>
  );
}

"use client";

import { ExternalLink } from "lucide-react";
import { formatPct, formatUsd, formatUsdPrice } from "@/lib/format";
import { useCountdown } from "@/hooks/use-now";
import { Button } from "@/components/ui/button";
import { ResponsiveOverlay } from "@/components/ui/overlay";
import { InlineNotice } from "@/components/ui/states";
import { TransactionProgress } from "@/components/trading/transaction-progress";
import type { TradeFlow } from "./use-trade-flow";

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-[14px] text-text-secondary">{label}</dt>
      <dd className={strong ? "num text-[16px] font-semibold text-text-primary" : "num text-[14px] text-text-primary"}>{value}</dd>
    </div>
  );
}

/**
 * Trade review + transaction status (blueprint 20). Nothing is sent by the
 * ticket's first click: this sheet shows exactly what the backend quoted, and
 * only Confirm sends it. After Confirm the sheet becomes the lifecycle view.
 */
export function TradeConfirmation({ flow, onRefreshQuote }: { flow: TradeFlow; onRefreshQuote: () => void }) {
  const { status, quote, trade, error, source, failedAt } = flow;
  const open = status !== "idle";
  const remaining = useCountdown(quote?.expiresAt ?? null);
  const expired = status === "reviewing" && remaining !== null && remaining <= 0;
  const inFlight = status === "preparing" || status === "awaiting_wallet" || status === "submitted" || status === "confirming";

  if (!quote) return null;
  const buy = quote.side === "buy";
  const title = `${buy ? "Buy" : "Sell"} ${quote.symbol}`;

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={(next) => {
        if (!next && !inFlight) flow.reset();
      }}
      dismissible={!inFlight}
      title={title}
      description={status === "reviewing" ? "Review the quote before you confirm." : undefined}
      footer={
        status === "reviewing" ? (
          expired ? (
            <Button block size="lg" onClick={onRefreshQuote}>
              Quote expired — refresh
            </Button>
          ) : (
            <Button block size="lg" variant={buy ? "success" : "danger"} onClick={() => void flow.confirm()}>
              Confirm {buy ? "buy" : "sell"}
            </Button>
          )
        ) : status === "confirmed" ? (
          <Button block size="lg" onClick={flow.reset}>Done</Button>
        ) : status === "failed" ? (
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="secondary" onClick={flow.reset}>Close</Button>
            <Button onClick={flow.reset}>Try again</Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {source === "fixture" ? <InlineNotice tone="warning">Sample data — no real trade is sent and no transaction exists.</InlineNotice> : null}

        {status === "reviewing" ? (
          <>
            <dl className="divide-y divide-border-subtle">
              <Row label="You pay" value={formatUsd(Number(quote.inputAmount), { cents: true })} strong />
              <Row label="You receive" value={`≈ ${quote.estimatedOutputAmount} ${quote.outputSymbol}`} strong />
              <Row label="Execution price" value={formatUsdPrice(quote.executionPriceUsd)} />
              <Row label="Price impact" value={quote.priceImpactPct === null ? "—" : formatPct(quote.priceImpactPct, { digits: 2, signed: false })} />
              <Row label="Fees" value={formatUsd(quote.feeUsd, { cents: true })} />
              <Row label="Route" value={quote.route ?? "—"} />
            </dl>
            <p className={expired ? "text-[13px] text-warning" : "text-[13px] text-text-secondary"}>
              {expired ? "This quote has expired. Refresh to get a current price." : remaining === null ? "Quote valid briefly." : `Quote expires in ${remaining}s.`}
            </p>
          </>
        ) : (
          <>
            <TransactionProgress status={status} failedAt={failedAt} />
            {status === "failed" && error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
            {status === "confirmed" ? (
              <div className="rounded-xl border border-success/25 bg-success-soft/40 p-4 text-[14px]">
                <p className="font-semibold text-success">
                  {buy ? "Bought" : "Sold"} {trade?.outputAmount ?? quote.estimatedOutputAmount} {quote.symbol}
                </p>
                <p className="mt-1 text-text-secondary">
                  at {formatUsdPrice(trade?.effectivePriceUsd ?? quote.executionPriceUsd)} · fees {formatUsd(trade?.feeUsd ?? quote.feeUsd, { cents: true })}
                </p>
                {trade?.txSignature ? (
                  <a
                    href={`https://solscan.io/tx/${encodeURIComponent(trade.txSignature)}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-2 inline-flex items-center gap-1 text-[13px] text-[#b79bff] underline underline-offset-2"
                  >
                    View transaction <ExternalLink size={12} aria-hidden="true" />
                  </a>
                ) : source === "fixture" ? (
                  <p className="mt-2 text-[12px] text-text-muted">No transaction signature: sample data.</p>
                ) : null}
              </div>
            ) : null}
            {inFlight ? <p className="text-[12px] text-text-muted">You can keep this open. Closing is disabled until the trade settles.</p> : null}
          </>
        )}
      </div>
    </ResponsiveOverlay>
  );
}

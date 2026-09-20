import { cn } from "@/lib/cn";
import { DIRECTION_TEXT, directionOf, formatPct, formatSignedUsd, formatUsd, formatUsdPrice } from "@/lib/format";
import { PriceChange } from "@/components/markets/price-change";
import type { CompetitionPosition } from "@/types/trading";

function Cell({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[12px] text-text-secondary">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

/**
 * The viewer's competition position in the active asset. The headline is Total
 * PnL % - the number that ranks the table - with dollars secondary (blueprint 21).
 * All values are the backend's; with no position it says so rather than showing zeros.
 */
export function PositionSummary({
  position,
  symbol,
  compact = false,
  className,
}: {
  position: CompetitionPosition | null;
  symbol: string;
  compact?: boolean;
  className?: string;
}) {
  if (!position) {
    return (
      <section aria-label="Your position" className={cn("rounded-card border border-border-subtle bg-surface-1 p-4", className)}>
        <h3 className="font-display text-[16px] font-bold text-text-primary">Your Position</h3>
        <p className="mt-2 text-[13px] text-text-secondary">You don&apos;t hold ${symbol} in this match yet. Your first confirmed buy opens a position.</p>
      </section>
    );
  }

  const unrealizedDir = directionOf(position.unrealizedPnlUsd);
  const realizedDir = directionOf(position.realizedPnlUsd);
  const totalDir = directionOf(position.totalPnlPct);

  return (
    <section aria-label="Your position" className={cn("rounded-card border border-border-subtle bg-surface-1 p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-[16px] font-bold text-text-primary">Your Position</h3>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-[0.08em] text-text-secondary">Total PnL</p>
          <PriceChange value={position.totalPnlPct} className="text-[22px] font-bold leading-6" />
          <p className={cn("num text-[12px]", DIRECTION_TEXT[totalDir])}>{formatSignedUsd(position.totalPnlUsd)}</p>
        </div>
      </div>
      <dl className={cn("mt-3 grid gap-x-4 gap-y-3 border-t border-border-subtle pt-3", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>
        <Cell label="Quantity">
          <span className="num text-[15px] font-semibold text-text-primary">{position.quantity}</span>
        </Cell>
        <Cell label="Avg. Entry">
          <span className="num text-[15px] font-semibold text-text-primary">{formatUsdPrice(position.averageEntryUsd)}</span>
        </Cell>
        <Cell label="Value">
          <span className="num text-[15px] font-semibold text-text-primary">{formatUsd(position.currentValueUsd)}</span>
        </Cell>
        <Cell label="Unrealized PnL">
          <span className={cn("num text-[15px] font-semibold", DIRECTION_TEXT[unrealizedDir])}>{formatSignedUsd(position.unrealizedPnlUsd)}</span>
          <span className={cn("num block text-[12px]", DIRECTION_TEXT[unrealizedDir])}>{formatPct(position.unrealizedPnlPct)}</span>
        </Cell>
        <Cell label="Realized PnL">
          <span className={cn("num text-[15px] font-semibold", DIRECTION_TEXT[realizedDir])}>{formatSignedUsd(position.realizedPnlUsd)}</span>
        </Cell>
      </dl>
    </section>
  );
}

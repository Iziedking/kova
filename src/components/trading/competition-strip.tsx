"use client";

import { cn } from "@/lib/cn";
import { formatAnsemRaw } from "@/lib/format";
import { CompetitionTimer } from "@/components/play/competition-timer";
import { PriceChange } from "@/components/markets/price-change";
import { AnsemIcon } from "@/components/brand/ansem-icon";

/**
 * The sticky mobile strip (blueprint 23): rank, live PnL, time left and pot in
 * 44-48px. Tapping it opens the full standings sheet, so the match context is
 * always one glance away while the person trades.
 */
export function CompetitionStrip({
  rank,
  pnlPct,
  endsAt,
  serverTime,
  readAt,
  potRaw,
  onOpen,
  className,
}: {
  rank: number | null;
  pnlPct: number | null;
  endsAt: string | null;
  serverTime: string;
  readAt: number;
  potRaw: string | null;
  onOpen: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open live standings"
      className={cn(
        "grid w-full grid-cols-4 items-center rounded-card border border-border-subtle bg-surface-1 px-1 py-2 text-center transition-colors active:bg-surface-2",
        className,
      )}
    >
      <span>
        <span className="num block text-[16px] font-semibold text-text-primary">{rank ? `#${rank}` : "—"}</span>
        <span className="block text-[11px] text-text-secondary">Your Rank</span>
      </span>
      <span>
        <PriceChange value={pnlPct} className="block text-[16px] font-semibold" />
        <span className="block text-[11px] text-text-secondary">Live PnL</span>
      </span>
      <span>
        <CompetitionTimer endsAt={endsAt} serverTime={serverTime} readAt={readAt} format="clock" showIcon={false} className="justify-center [&_p]:text-[16px]" />
        <span className="block text-[11px] text-text-secondary">Time Left</span>
      </span>
      <span>
        <span className="flex items-center justify-center gap-1">
          <AnsemIcon size={16} />
          <span className="num text-[14px] font-semibold text-text-primary">{formatAnsemRaw(potRaw, { unit: false })}</span>
        </span>
        <span className="block text-[11px] text-text-secondary">Prize Pool</span>
      </span>
    </button>
  );
}

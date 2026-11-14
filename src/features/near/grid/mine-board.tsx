"use client";

/**
 * The 5 x 5 board. Each square shows the coins on it this round, shaded by its share of the round;
 * your own stake and the last round's winning square are marked in words, not only by colour.
 */
import { SQUARES, formatUnits, squareNumber, squareShare } from "@/adapters/near/grid";
import { cn } from "@/lib/cn";

export function MineBoard({
  totals,
  mine,
  decimals,
  symbol,
  selected,
  lastWinner,
  disabled,
  onSelect,
}: {
  totals: readonly bigint[];
  /** What the signed-in player has on each square this round. */
  mine: readonly bigint[];
  decimals: number;
  symbol: string;
  selected: number | null;
  lastWinner: number | null;
  disabled: boolean;
  onSelect: (square: number) => void;
}) {
  return (
    <div role="group" aria-label={`The ${symbol} grid: 25 squares`} className="grid grid-cols-5 gap-2 sm:gap-2.5">
      {Array.from({ length: SQUARES }, (_, square) => {
        const total = totals[square] ?? 0n;
        const yours = mine[square] ?? 0n;
        const share = squareShare(totals, square);
        const isSelected = selected === square;
        const isWinner = lastWinner === square;
        const label = `Square ${squareNumber(square)}. ${formatUnits(total, decimals)} ${symbol} on it.${yours > 0n ? ` You have ${formatUnits(yours, decimals)}.` : ""}${isWinner ? " It won the last round." : ""}`;
        return (
          <button
            key={square}
            type="button"
            aria-label={label}
            aria-pressed={isSelected}
            disabled={disabled}
            onClick={() => onSelect(square)}
            style={total > 0n ? { backgroundColor: `color-mix(in oklab, var(--color-accent) ${Math.round(14 + share * 70)}%, var(--color-surface-2))` } : undefined}
            className={cn(
              "relative flex aspect-square min-w-0 flex-col justify-between rounded-lg border p-1.5 text-left transition-colors sm:p-2.5",
              "bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60",
              isSelected ? "border-accent ring-2 ring-accent" : "border-border-subtle enabled:hover:border-border-strong",
              isWinner && !isSelected && "border-[#e8c26a]",
            )}
          >
            <span className="flex items-start justify-between gap-1">
              <span className="num text-[12px] font-semibold text-text-secondary sm:text-[13px]">{squareNumber(square)}</span>
              {isWinner ? <span className="rounded bg-[#e8c26a] px-1 text-[10px] font-bold uppercase leading-4 text-[#2a1d00]">Won</span> : null}
            </span>
            <span className="min-w-0">
              <span className="num block truncate text-[12px] font-semibold text-text-primary sm:text-[15px]">{total > 0n ? formatUnits(total, decimals, 1) : "0"}</span>
              {yours > 0n ? <span className="num block truncate text-[10px] font-semibold text-[#d5c4ff] sm:text-[11px]">you {formatUnits(yours, decimals, 1)}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

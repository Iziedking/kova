"use client";

import { Flame } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatChip } from "@/adapters/near/chip";
import { cn } from "@/lib/cn";

/**
 * The focal object: CHIP's total supply as the contract reports it. It moves only when a chain
 * read moves it. A fall is shown as the amount burned, sliding out of the counter.
 */
export function SupplyCounter({ supply, stale, size = "lg", className }: { supply: bigint | null; stale?: boolean; size?: "lg" | "md"; className?: string }) {
  const previous = useRef<bigint | null>(null);
  const [burned, setBurned] = useState<{ amount: bigint; key: number } | null>(null);

  useEffect(() => {
    if (supply === null) return;
    if (previous.current !== null && supply < previous.current) {
      setBurned({ amount: previous.current - supply, key: Date.now() });
    }
    previous.current = supply;
  }, [supply]);

  return (
    <div className={cn("relative", className)}>
      <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-text-muted">CHIP supply</p>
      <p
        className={cn("num font-display font-bold leading-none tracking-[-0.02em] text-text-primary", size === "lg" ? "mt-2 text-[40px] sm:text-[52px]" : "mt-1 text-[28px]")}
        aria-live="polite"
        aria-atomic="true"
      >
        {supply === null ? <span className="text-text-muted">…</span> : formatChip(supply, 2)}
      </p>
      <div className="mt-1 flex min-h-6 items-center gap-2 text-[12px] text-text-secondary">
        {stale ? <span className="text-warning">Last read failed. Showing the last on-chain value.</span> : <span>Read from the contract</span>}
        {burned ? (
          <span key={burned.key} className="kova-burn-slide inline-flex items-center gap-1 font-semibold text-danger">
            <Flame size={13} aria-hidden="true" />
            {formatChip(burned.amount, 2)} burned
          </span>
        ) : null}
      </div>
    </div>
  );
}

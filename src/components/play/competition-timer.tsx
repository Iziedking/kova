"use client";

import { Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatClock, formatDuration } from "@/lib/format";
import { useCountdown } from "@/hooks/use-now";

/**
 * Remaining time in a match. Derived from the server's `endsAt`, corrected by
 * the server/client clock offset captured at read time, so a wrong device clock
 * cannot show a wrong countdown. Renders `--:--` until the clock is running.
 */
export function CompetitionTimer({
  endsAt,
  serverTime,
  readAt,
  format = "words",
  showIcon = true,
  label,
  className,
}: {
  endsAt: string | null;
  serverTime?: string | null;
  /** Client `Date.now()` at the moment `serverTime` was received. */
  readAt?: number;
  format?: "words" | "clock";
  showIcon?: boolean;
  /** Small caption under the time, e.g. `remaining`. */
  label?: string;
  className?: string;
}) {
  const seconds = useCountdown(endsAt, serverTime, readAt);
  const text = seconds === null ? (format === "clock" ? "--:--" : "—") : format === "clock" ? formatClock(seconds) : formatDuration(seconds);
  const urgent = seconds !== null && seconds <= 60;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {showIcon ? <Clock size={18} className={urgent ? "text-warning" : "text-text-secondary"} aria-hidden="true" /> : null}
      <div className="leading-tight">
        <p className={cn("num text-[15px] font-semibold", urgent ? "text-warning" : "text-text-primary")} aria-live="off">
          {text}
        </p>
        {label ? <p className="text-[12px] text-text-secondary">{label}</p> : null}
      </div>
    </div>
  );
}

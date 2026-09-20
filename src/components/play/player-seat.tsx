import { Check, Lock, UserPlus } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CompetitionMode, SeatReadiness, TableSeat } from "@/types/competition";
import { PlayerAvatar } from "@/components/social/player-avatar";
import { Badge } from "@/components/ui/badge";

/**
 * Readiness copy is mode-specific and never reveals a hidden Prediction pick:
 * a locked seat says `PICK LOCKED` and nothing about what was picked.
 */
const SEAT_DETAIL: Record<SeatReadiness, string> = {
  empty: "Waiting for a player",
  invited: "Invitation sent",
  joined: "Seated, stake not funded yet",
  funded: "Stake funded",
  locked: "Stake funded",
  ready: "Stake funded",
};

function readinessLabel(readiness: SeatReadiness, mode: CompetitionMode): { text: string; tone: "neutral" | "accent" | "success" | "warning" } {
  switch (readiness) {
    case "empty":
      return { text: "Open seat", tone: "neutral" };
    case "invited":
      return { text: "Invited", tone: "warning" };
    case "joined":
      return { text: "Joined · not funded", tone: "warning" };
    case "funded":
      return mode === "trading" ? { text: "Funded / ready", tone: "success" } : { text: "Funded", tone: "success" };
    case "locked":
      return { text: "Pick locked", tone: "accent" };
    case "ready":
      return { text: "Ready", tone: "success" };
  }
}

export function PlayerSeat({ seat, mode, className }: { seat: TableSeat; mode: CompetitionMode; className?: string }) {
  const { text, tone } = readinessLabel(seat.readiness, mode);
  const empty = seat.player === null;
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-card border px-4 py-3",
        seat.isViewer ? "border-accent-line bg-accent-soft/50" : "border-border-subtle bg-surface-1",
        empty && "border-dashed",
        className,
      )}
    >
      {empty ? (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-dashed border-border-strong text-text-muted">
          <UserPlus size={16} aria-hidden="true" />
        </span>
      ) : (
        <PlayerAvatar username={seat.player!.username} src={seat.player!.avatarUrl} size="md" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-text-primary">
          {empty ? `Seat ${seat.seat}` : `@${seat.player!.username}`}
          {seat.isViewer ? <span className="ml-2 text-[12px] font-medium text-[#b79bff]">You</span> : null}
        </p>
        <p className="text-[12px] text-text-secondary">{SEAT_DETAIL[seat.readiness]}</p>
      </div>
      <Badge tone={tone} icon={seat.readiness === "locked" ? <Lock size={12} /> : seat.readiness === "ready" || seat.readiness === "funded" ? <Check size={12} /> : undefined}>
        {text}
      </Badge>
    </li>
  );
}

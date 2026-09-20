import { Swords } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import type { HotPlayer } from "@/types/social";
import { PriceChange } from "@/components/markets/price-change";
import { PlayerAvatar } from "./player-avatar";

/** A Hot Players row: rank, avatar, identity, headline performance, Challenge. */
export function PlayerRow({
  player,
  onChallenge,
  className,
}: {
  player: HotPlayer;
  onChallenge?: (username: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 py-2.5", className)}>
      <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border-strong text-[12px] font-medium text-text-secondary">
        {player.rank}
      </span>
      <Link href={`/profile/${encodeURIComponent(player.username)}`} className="flex min-w-0 flex-1 items-center gap-3">
        <PlayerAvatar username={player.username} src={player.avatarUrl} size="md" verified={player.verified} />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold leading-5 text-text-primary">{player.username}</span>
          {player.handle ? <span className="block truncate text-[12px] leading-4 text-text-muted">{player.handle}</span> : null}
        </span>
      </Link>
      <PriceChange value={player.performancePct} className="shrink-0 text-[15px] font-semibold" />
      {onChallenge ? (
        <button
          type="button"
          onClick={() => onChallenge(player.username)}
          aria-label={`Challenge ${player.username}`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border-strong text-text-secondary transition-colors hover:border-accent-line hover:bg-accent-soft hover:text-[#c3a9ff]"
        >
          <Swords size={15} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

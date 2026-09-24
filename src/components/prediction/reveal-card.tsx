import { Crown } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatUsdPrice } from "@/lib/format";
import type { RevealedPick } from "@/types/competition";
import { AssetAvatar } from "@/components/markets/asset-avatar";
import { PriceChange } from "@/components/markets/price-change";
import { PlayerAvatar } from "@/components/social/player-avatar";

/**
 * One player's pick, face-up at the showdown: token, start and end price, and %
 * return. Cards animate in sequence via `index`; reduced-motion users get the
 * final state immediately (see the global reduced-motion rule).
 */
export function RevealCard({ pick, index }: { pick: RevealedPick; index: number }) {
  return (
    <li
      style={{ animationDelay: `${index * 420}ms` }}
      className={cn(
        "animate-reveal rounded-card border p-4 [animation-fill-mode:both]",
        pick.isWinner ? "border-accent bg-accent-soft" : "border-border-subtle bg-surface-1",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <PlayerAvatar username={pick.username} src={pick.avatarUrl} size="sm" />
          <p className="truncate text-[14px] font-medium text-text-primary">
            @{pick.username}
            {pick.isViewer ? <span className="ml-1.5 text-[12px] text-[#b79bff]">You</span> : null}
          </p>
        </div>
        {pick.isWinner ? <Crown size={16} className="text-accent" aria-label="Winner" /> : null}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <AssetAvatar symbol={pick.symbol} size="lg" />
        <div className="min-w-0">
          <p className="text-[18px] font-semibold text-text-primary">${pick.symbol}</p>
          <p className="truncate text-[12px] text-text-secondary">{pick.name}</p>
        </div>
        <PriceChange value={pick.returnPct} digits={1} className="ml-auto text-[22px] font-semibold" />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border-subtle pt-3">
        <div>
          <dt className="text-[11px] uppercase tracking-[0.06em] text-text-muted">Start</dt>
          <dd className="num text-[14px] text-text-primary">{formatUsdPrice(pick.startPriceUsd)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.06em] text-text-muted">End</dt>
          <dd className="num text-[14px] text-text-primary">{formatUsdPrice(pick.endPriceUsd)}</dd>
        </div>
      </dl>
    </li>
  );
}

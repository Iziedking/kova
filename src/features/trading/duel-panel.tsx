"use client";

import { formatAnsemRaw } from "@/lib/format";
import { CompetitionTimer } from "@/components/play/competition-timer";
import { PriceChange } from "@/components/markets/price-change";
import { PlayerAvatar } from "@/components/social/player-avatar";
import { LiveBadge } from "@/components/ui/badge";
import { MiniLeaderboard } from "@/components/trading/mini-leaderboard";
import { AnsemIcon } from "@/components/brand/ansem-icon";
import type { CompetitionStanding, TableDetail } from "@/types/competition";

/**
 * The match context that stays visible while trading (desktop right rail, top):
 * mode, the standings, the pot and the clock. Two players read as a duel; more
 * read as a ranked list. Ranked by net PnL % only.
 */
export function DuelPanel({ table, standings, readAt }: { table: TableDetail; standings: CompetitionStanding[] | null; readAt: number }) {
  const duel = standings !== null && standings.length === 2;
  const title = duel || table.maxPlayers === 2 ? "Trading Duel" : "Trading Table";
  const live = table.status === "active";

  return (
    <section aria-label={title} className="rounded-panel border border-border-subtle bg-surface-1 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[20px] font-bold text-text-primary">{title}</h2>
        {live ? <LiveBadge /> : <span className="text-[13px] text-text-secondary">Settling</span>}
      </div>

      {duel ? (
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-start gap-2 text-center">
          {[standings[0], standings[1]].map((row, index) => (
            <div key={row.username} className={index === 1 ? "order-3" : "order-1"}>
              <div className="flex justify-center">
                <PlayerAvatar username={row.username} src={row.avatarUrl} size="xl" ring={row.isViewer} />
              </div>
              <p className="mt-1.5 truncate text-[15px] font-semibold text-text-primary">{row.isViewer ? "You" : row.username}</p>
              <PriceChange value={row.netPnlPct} className="text-[22px] font-bold" />
            </div>
          ))}
          <span className="order-2 mt-6 grid h-9 w-9 place-items-center rounded-full border border-border-strong bg-surface-2 text-[12px] font-semibold text-text-secondary">VS</span>
        </div>
      ) : (
        <div className="mt-3">
          <MiniLeaderboard standings={standings} />
        </div>
      )}

      <div className="mt-4 rounded-card border border-border-subtle bg-surface-2 px-4 py-3 text-center">
        <p className="flex items-center justify-center gap-2 text-[13px] text-text-secondary">
          Pot
          <AnsemIcon size={18} />
          <span className="num text-[20px] font-semibold text-text-primary">{formatAnsemRaw(table.potAnsemRaw)}</span>
        </p>
        <p className="mt-0.5 text-[12px] text-text-secondary">Winner takes {formatAnsemRaw(table.potAnsemRaw)}</p>
      </div>
      <CompetitionTimer endsAt={table.endsAt} serverTime={table.serverTime} readAt={readAt} format="clock" label="remaining" className="mt-3 justify-center" />
    </section>
  );
}

"use client";

import { Loader2, Swords } from "lucide-react";
import { formatAnsemRaw } from "@/lib/format";
import { useCountdown } from "@/hooks/use-now";
import { CompetitionTimer } from "@/components/play/competition-timer";
import { PotDisplay } from "@/components/play/pot-display";
import { DealerMessage } from "@/components/dealer/dealer-message";
import { LockedHand } from "@/components/prediction/locked-hand";
import { PlayerAvatar } from "@/components/social/player-avatar";
import { Badge } from "@/components/ui/badge";
import { InlineNotice } from "@/components/ui/states";
import { TableHeader } from "@/features/competitions/table-header";
import type { TableDetail } from "@/types/competition";

/**
 * Active Prediction match (blueprint 12). The composition is about the
 * opponent, the stake, the pot, the clock and the locked state - not a chart.
 * Nothing here can show a pick: every seat is a face-down card until the
 * showdown, and Dealer commentary is market-level only.
 */
export function PredictionMatch({ table, readAt }: { table: TableDetail; readAt: number }) {
  const seconds = useCountdown(table.endsAt, table.serverTime, readAt);
  const ended = seconds === 0 || table.status === "settling";
  const seated = table.seats.filter((seat) => seat.player);

  return (
    <div className="space-y-8">
      <TableHeader table={table} readAt={readAt} showTimer={false} />

      {/* The pulse: pot and clock, centred above the players. */}
      <section
        aria-label="Match status"
        className="grid items-center gap-6 rounded-panel border border-border-subtle bg-surface-1 p-5 md:grid-cols-3 md:p-7"
      >
        <PotDisplay potRaw={table.potAnsemRaw} size="lg" caption={`Winner takes ${formatAnsemRaw(table.potAnsemRaw)}`} className="md:items-start" />
        <div className="text-center">
          {ended ? (
            <div className="flex flex-col items-center gap-2" role="status">
              <Loader2 size={26} className="animate-spin text-accent" aria-hidden="true" />
              <p className="font-display text-[22px] font-bold text-text-primary">Settling the round…</p>
              <p className="text-[13px] text-text-secondary">Reading the closing prices.</p>
            </div>
          ) : (
            <>
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-text-secondary">Time remaining</p>
              <CompetitionTimer endsAt={table.endsAt} serverTime={table.serverTime} readAt={readAt} format="clock" showIcon={false} className="justify-center [&_p]:text-[44px] [&_p]:leading-[48px] md:[&_p]:text-[52px]" />
            </>
          )}
        </div>
        <div className="flex items-center gap-2 md:justify-end">
          <Badge tone="accent" icon={<Swords size={12} />}>{table.filledSeats} players</Badge>
        </div>
      </section>

      {/* Players: face-down cards. */}
      <section aria-labelledby="players-title">
        <h2 id="players-title" className="mb-3 font-display text-[18px] font-bold text-text-primary">The table</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(seated.length > 0 ? seated : table.seats).map((seat) => (
            <li key={seat.seat} className="flex items-center gap-4 rounded-card border border-border-subtle bg-surface-1 p-4">
              <LockedHand locked={seat.readiness === "locked" || seat.readiness === "funded" || seat.readiness === "ready"} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {seat.player ? <PlayerAvatar username={seat.player.username} src={seat.player.avatarUrl} size="sm" /> : null}
                  <p className="truncate text-[15px] font-semibold text-text-primary">
                    {seat.player ? `@${seat.player.username}` : `Seat ${seat.seat}`}
                    {seat.isViewer ? <span className="ml-1.5 text-[12px] font-medium text-[#b79bff]">You</span> : null}
                  </p>
                </div>
                <p className="mt-1 text-[12px] font-medium uppercase tracking-[0.08em] text-[#b79bff]">Pick locked</p>
                <p className="text-[12px] text-text-muted">Revealed at the showdown</p>
              </div>
            </li>
          ))}
        </ul>
        {table.maxPlayers > table.seats.length ? (
          <p className="mt-2 text-[12px] text-text-muted">{table.filledSeats} of {table.maxPlayers} seats filled</p>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="dealer-title" className="rounded-panel border border-border-subtle bg-surface-1 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="dealer-title" className="font-display text-[18px] font-bold text-text-primary">Dealer</h2>
            {table.dealerStatus ? (
              <Badge tone={table.dealerStatus === "ready" ? "success" : table.dealerStatus === "degraded" ? "warning" : "danger"}>
                {table.dealerStatus === "ready" ? "Ready" : table.dealerStatus === "degraded" ? "Degraded" : "Unavailable"}
              </Badge>
            ) : null}
          </div>
          {table.dealer.length > 0 ? (
            <div className="space-y-4">
              {table.dealer.slice(0, 3).map((message) => (
                <DealerMessage key={message.id} message={message} />
              ))}
            </div>
          ) : (
            <p className="text-[14px] text-text-secondary">The Dealer is quiet. Commentary shows up here as the round unfolds.</p>
          )}
        </section>

        <section aria-labelledby="activity-title" className="rounded-panel border border-border-subtle bg-surface-1 p-5">
          <h2 id="activity-title" className="mb-4 font-display text-[18px] font-bold text-text-primary">Table activity</h2>
          {table.activity.length > 0 ? (
            <ul className="space-y-3">
              {table.activity.map((item) => (
                <li key={item.id} className="flex items-center gap-3 text-[14px] text-text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                  {item.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-text-secondary">Joins and locks will appear here.</p>
          )}
        </section>
      </div>

      <InlineNotice tone="info">Picks stay hidden until the bell. The strongest percentage move between the start and end prices wins the pot.</InlineNotice>
    </div>
  );
}

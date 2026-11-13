"use client";

import { Crown } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { clanPath, readClanRace } from "./clans";
import { useNear } from "./near-session";
import { usePoll } from "./use-poll";

/**
 * Today's clan race, read from the contract: clans by settled tables today. The leader's members
 * claim a double share of the daily mint if the day meets its target.
 */
export function ClanRace({ limit = 5, viewerClan, weight }: { limit?: number; viewerClan?: string | null; weight?: number }) {
  const { chip } = useNear();
  const stats = usePoll(() => chip.getStats(), 15_000, "race-stats");
  const today = stats.data?.today ?? null;
  const day = usePoll(today !== null ? () => chip.getDay(today) : null, 15_000, `race-day:${today}`);
  const race = usePoll(today !== null && day.data ? () => readClanRace(chip, today, day.data?.top_clan) : null, 20_000, `race:${today}:${day.data?.top_clan ?? ""}`);

  if (stats.data && stats.data.clans_created === undefined) {
    return <p className="text-[12px] text-text-muted">This contract has no clans.</p>;
  }
  const rows = race.data ?? [];
  const playing = rows.filter((r) => r.tables > 0);
  const shown = (playing.length ? playing : rows).slice(0, limit);

  return (
    <div>
      {race.data === null ? (
        <p className="text-[13px] text-text-muted">{race.error ? `Clan race unavailable: ${race.error}` : "Reading the clan race…"}</p>
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-text-muted">No clan yet. Found the first one and every table its members play counts for it.</p>
      ) : (
        <>
          {!playing.length ? <p className="mb-2 text-[12px] text-text-muted">No clan has a settled table today yet.</p> : null}
          <ol className="divide-y divide-border-subtle" aria-label="Clans by settled tables today">
            {shown.map((row) => (
              <li key={row.name} className={cn("grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 py-2", row.name === viewerClan && "-mx-2 rounded-lg bg-accent-soft px-2")}>
                <span className="num text-[13px] font-semibold text-text-muted">{row.tables > 0 ? row.rank : "–"}</span>
                <span className="min-w-0">
                  <Link href={clanPath(row.name)} className="flex min-w-0 items-center gap-1.5 text-[14px] font-semibold text-text-primary hover:underline">
                    <span className="truncate">{row.name}</span>
                    {row.top && row.tables > 0 ? <Crown size={13} className="shrink-0 text-warning" aria-label="Leading today" /> : null}
                  </Link>
                  <span className="num block text-[11px] text-text-muted">
                    {row.members} {row.members === 1 ? "member" : "members"} · {row.players} played today
                  </span>
                </span>
                <span className="num text-right text-[14px] font-semibold text-text-primary">
                  {row.tables} <span className="text-[11px] font-medium text-text-muted">{row.tables === 1 ? "table" : "tables"}</span>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="mt-2 text-[11px] leading-4 text-text-muted">
        Every settled table counts once for each clan at it. If today meets its target, the leading clan&apos;s players claim {weight ?? 2} shares of the daily mint and everyone else who played claims one. On a tie, the clan that got there first leads.
      </p>
      {day.data?.top_clan && rows.length ? (
        <Badge tone="outline" className="mt-2">
          Leading: {day.data.top_clan}
        </Badge>
      ) : null}
    </div>
  );
}

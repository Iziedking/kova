"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatChip } from "@/adapters/near/chip";
import { launchLabel, launchUrl } from "@/adapters/near/launch-calls";
import { type LeaderboardJson, type ScoutJson, displayAccount } from "@/adapters/near/leaderboard";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/section";
import { cn } from "@/lib/cn";
import { nearNetwork } from "./near-session";
import { NEAR_TOKEN_PATH } from "./paths";
import { usePoll } from "./use-poll";


type Board = LeaderboardJson & { scouts?: ScoutJson[]; stale: boolean; updatedAt: string; source: string };
type Row = Board["rows"][number];

function ScoutLine({ row, tied, viewer }: { row: ScoutJson; tied: boolean; viewer?: string | null }) {
  const isViewer = row.player === viewer;
  const value = BigInt(row.net);
  const url = launchUrl(row.lastMarket);
  return (
    <li className={cn("grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 py-2.5", isViewer && "-mx-2 rounded-lg bg-accent-soft px-2")}>
      <span className="num text-[13px] font-semibold text-text-muted" aria-label={tied ? `Tied for rank ${row.rank}` : `Rank ${row.rank}`}>
        {tied ? `=${row.rank}` : row.rank}
      </span>
      <div className="min-w-0">
        <p className="flex min-w-0 items-center gap-1.5">
          <a className="truncate text-[14px] font-semibold text-text-primary hover:underline" href={nearNetwork.explorerAccount(row.player)} target="_blank" rel="noreferrer" title={row.player}>
            {row.isHouse ? "The House" : displayAccount(row.player)}
          </a>
          {isViewer ? <Badge tone="outline">You</Badge> : null}
        </p>
        <p className="num text-[11px] text-text-muted">
          {row.called} called · {row.splits} split · {row.calls} {row.calls === 1 ? "launch table" : "launch tables"} · last{" "}
          {url ? (
            <a className="underline" href={url} target="_blank" rel="noreferrer">
              {launchLabel(row.lastMarket)}
            </a>
          ) : (
            launchLabel(row.lastMarket)
          )}
        </p>
      </div>
      <span className={cn("num text-right text-[14px] font-semibold", value > 0n ? "text-success" : value < 0n ? "text-danger" : "text-text-secondary")}>
        {value > 0n ? "+" : ""}
        {formatChip(value, 0)} <span className="text-[11px] font-medium text-text-muted">CHIP</span>
      </span>
    </li>
  );
}

function sharedRanks(rows: readonly { rank: number }[]): Set<number> {
  return new Set(rows.filter((r, i) => rows.some((o, j) => j !== i && o.rank === r.rank)).map((r) => r.rank));
}

async function readBoard(): Promise<Board> {
  const response = await fetch("/api/near/leaderboard");
  const body = (await response.json()) as Board & { error?: { message: string } };
  if (!response.ok || !body.rows) throw new Error(body.error?.message ?? `HTTP ${response.status}`);
  return body;
}

function net(row: Row) {
  const value = BigInt(row.net);
  return `${value > 0n ? "+" : ""}${formatChip(value, 0)}`;
}

function BoardRow({ row, tied, viewer }: { row: Row; tied: boolean; viewer?: string | null }) {
  const isViewer = row.player === viewer;
  const value = BigInt(row.net);
  return (
    <li className={cn("grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 py-2.5", isViewer && "-mx-2 rounded-lg bg-accent-soft px-2")}>
      <span className="num text-[13px] font-semibold text-text-muted" aria-label={tied ? `Tied for rank ${row.rank}` : `Rank ${row.rank}`}>
        {tied ? `=${row.rank}` : row.rank}
      </span>
      <div className="min-w-0">
        <p className="flex min-w-0 items-center gap-1.5">
          <a className="truncate text-[14px] font-semibold text-text-primary hover:underline" href={nearNetwork.explorerAccount(row.player)} target="_blank" rel="noreferrer" title={row.player}>
            {row.isHouse ? "The House" : displayAccount(row.player)}
          </a>
          {isViewer ? <Badge tone="outline">You</Badge> : null}
        </p>
        <p className="num text-[11px] text-text-muted">
          {row.tables} {row.tables === 1 ? "table" : "tables"} · {row.wins} won · {row.splits} split · {row.losses} lost
        </p>
      </div>
      <span className={cn("num text-right text-[14px] font-semibold", value > 0n ? "text-success" : value < 0n ? "text-danger" : "text-text-secondary")}>
        {net(row)} <span className="text-[11px] font-medium text-text-muted">CHIP</span>
      </span>
    </li>
  );
}

/**
 * Players ranked by net CHIP over settled tables. `limit` rows are shown; a viewer below the cut
 * still sees their own rank under the list.
 */
export function NearLeaderboard({ limit, viewer, compact = false, id }: { limit: number; viewer?: string | null; compact?: boolean; id?: string }) {
  const board = usePoll(readBoard, 30_000, "leaderboard");
  const [view, setView] = useState<"players" | "scouts">("players");
  const rows = board.data?.rows ?? [];
  const shown = rows.slice(0, limit);
  const viewerRank = viewer ? rows.findIndex((r) => r.player === viewer) : -1;
  const viewerBelow = viewerRank >= limit ? rows[viewerRank] : null;
  const shared = sharedRanks(rows);
  const scouts = board.data?.scouts;
  const scoutShared = sharedRanks(scouts ?? []);

  return (
    <Card className={cn("scroll-mt-24", compact ? "p-5" : "p-6")} as="section" id={id}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={cn("font-display font-bold text-text-primary", compact ? "text-[16px]" : "text-[18px]")}>
          Leaderboard
        </h2>
        {board.data ? (
          <p className="num text-[12px] text-text-muted">
            {board.data.settledTables} settled {board.data.settledTables === 1 ? "table" : "tables"}
          </p>
        ) : null}
      </div>
      <div role="radiogroup" aria-label="Leaderboard view" className="mt-2 inline-flex gap-1 rounded-xl border border-border-subtle bg-surface-2 p-1">
        {(
          [
            ["players", "Players"],
            ["scouts", "Launch scouts"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={view === value}
            onClick={() => setView(value)}
            className={cn("min-h-9 rounded-lg px-3 text-[13px] font-semibold transition-colors", view === value ? "bg-surface-3 text-text-primary" : "text-text-muted hover:text-text-secondary")}
          >
            {label}
          </button>
        ))}
      </div>
      {!compact ? (
        <p className="mt-2 text-[12px] text-text-muted">
          {view === "players"
            ? "Net CHIP over every settled table: awards minus stakes."
            : "Who called launches best: seats whose pick was a meme.cooking launch or a “Will it cook?” call, ranked by pots taken, then net CHIP on those seats."}{" "}
          Built from the contract&apos;s <code className="text-text-secondary">get_tables</code> view, so anyone can rebuild it. Refunded tables do not count.
        </p>
      ) : null}

      {view === "scouts" ? (
        board.data === null ? (
          <p className="mt-4 text-[13px] text-text-muted">{board.error ? `Leaderboard unavailable: ${board.error}` : "Reading every settled table…"}</p>
        ) : scouts === undefined ? (
          <p className="mt-4 text-[13px] text-text-muted">This server does not list launch scouts yet.</p>
        ) : scouts.length === 0 ? (
          <p className="mt-4 text-[13px] text-text-muted">No launch table has settled yet. Pick a coin from &ldquo;Launched on meme.cooking&rdquo;, or make a &ldquo;Will it cook?&rdquo; call, to be the first scout.</p>
        ) : (
          <ol className="mt-3 divide-y divide-border-subtle" aria-label="Launch scouts by pots taken">
            {scouts.slice(0, limit).map((row) => (
              <ScoutLine key={row.player} row={row} tied={scoutShared.has(row.rank)} viewer={viewer} />
            ))}
          </ol>
        )
      ) : board.data === null ? (
        <p className="mt-4 text-[13px] text-text-muted">{board.error ? `Leaderboard unavailable: ${board.error}` : "Reading every settled table…"}</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-[13px] text-text-muted">No table has settled yet. The first round you play against the House opens the board.</p>
      ) : (
        <>
          <ol className="mt-3 divide-y divide-border-subtle" aria-label="Players by net CHIP">
            {shown.map((row) => (
              <BoardRow key={row.player} row={row} tied={shared.has(row.rank)} viewer={viewer} />
            ))}
          </ol>
          {viewerBelow ? (
            <ol className="mt-1 border-t border-dashed border-border-strong pt-1" aria-label="Your place">
              <BoardRow row={viewerBelow} tied={shared.has(viewerBelow.rank)} viewer={viewer} />
            </ol>
          ) : null}
        </>
      )}

      {board.data?.truncated ? <p className="mt-2 text-[11px] text-text-muted">Counts the most recent 2,000 tables.</p> : null}
      {board.stale || board.data?.stale ? <p className="mt-2 text-[12px] text-warning">Could not refresh. Showing the last read.</p> : null}
      {compact ? (
        <Link href={`${NEAR_TOKEN_PATH}#leaderboard`} className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-[#b79bff] hover:text-[#d0bdff]">
          Full leaderboard <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      ) : null}
    </Card>
  );
}

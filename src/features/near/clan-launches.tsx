"use client";

import { ArrowUpRight, Rocket } from "lucide-react";
import { formatChip } from "@/adapters/near/chip";
import { type ScoutJson, sumLaunches } from "@/adapters/near/leaderboard";
import { memeUrl } from "@/adapters/near/meme-cooking";
import { Card } from "@/components/ui/section";
import { cn } from "@/lib/cn";
import { usePoll } from "./use-poll";

/** `scouts` is null when the server predates launch scouts. */
async function readScouts(): Promise<{ scouts: ScoutJson[] | null }> {
  const response = await fetch("/api/near/leaderboard");
  const body = (await response.json()) as { scouts?: ScoutJson[]; error?: { message: string } };
  if (!response.ok) throw new Error(body.error?.message ?? `HTTP ${response.status}`);
  return { scouts: body.scouts ?? null };
}

/**
 * The meme.cooking launches a clan's members backed at Kova tables, and how those calls did.
 * Built from the same settled tables as the leaderboard; counts the clan's current members.
 */
export function ClanLaunches({ members }: { members: readonly string[] }) {
  const read = usePoll(readScouts, 30_000, "clan-launches");
  const mine = (read.data?.scouts ?? []).filter((s) => members.includes(s.player));
  const launches = sumLaunches(mine);

  return (
    <Card className="p-5" as="section">
      <h2 className="flex items-center gap-2 text-[14px] font-semibold text-text-primary">
        <Rocket size={15} aria-hidden="true" /> Launches it backed
      </h2>
      <p className="mt-1 text-[12px] text-text-muted">meme.cooking tokens and &ldquo;Will it cook?&rdquo; calls its members played, from settled tables. Launch tables count for the clan race like any table.</p>
      {read.data === null ? (
        <p className="mt-3 text-[13px] text-text-muted">{read.error ? `Unavailable: ${read.error}` : "Reading settled tables…"}</p>
      ) : read.data.scouts === null ? (
        <p className="mt-3 text-[13px] text-text-muted">This server does not list launch tables yet.</p>
      ) : launches.length === 0 ? (
        <p className="mt-3 text-[13px] text-text-muted">No member has played a launch table yet. Pick a meme.cooking launch or make a call on the play page.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border-subtle">
          {launches.map((l) => (
            <li key={l.memeId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
              <span className="min-w-0">
                <a className="inline-flex items-center gap-1 text-[14px] font-semibold text-text-primary hover:underline" href={memeUrl(l.memeId)} target="_blank" rel="noreferrer">
                  {l.symbol} <ArrowUpRight size={13} aria-hidden="true" />
                </a>
                <span className="num block text-[11px] text-text-muted">
                  {l.calls} {l.calls === 1 ? "table" : "tables"} by {l.players} {l.players === 1 ? "member" : "members"} · {l.called} called · {l.splits} split
                </span>
              </span>
              <span className={cn("num text-[14px] font-semibold", l.net > 0n ? "text-success" : l.net < 0n ? "text-danger" : "text-text-secondary")}>
                {l.net > 0n ? "+" : ""}
                {formatChip(l.net, 0)} <span className="text-[11px] font-medium text-text-muted">CHIP</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

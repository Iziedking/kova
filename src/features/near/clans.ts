"use client";

import type { ChipClient, ChipClanSummary } from "@/adapters/near/chip";
import { SHARE_TAGS } from "@/adapters/near/share";

export type ClanStanding = ChipClanSummary & { tables: number; players: number; rank: number; top: boolean };

/**
 * Today's clan race read from the contract: every clan (newest 50) with its settled tables and
 * members who played today. The contract's `top_clan` is the leader; it wins ties (the clan that
 * reached the count first), so it is ranked first among equals here too.
 */
export async function readClanRace(chip: ChipClient, day: number, topClan: string | null | undefined): Promise<ClanStanding[]> {
  const clans = await chip.getClans(undefined, 50);
  const days = await Promise.all(clans.map((c) => chip.getClanDay(day, c.name)));
  const rows = clans.map((c, i) => ({ ...c, ...days[i], top: c.name === topClan }));
  rows.sort((a, b) => b.tables - a.tables || Number(b.top) - Number(a.top) || b.players - a.players || a.name.localeCompare(b.name));
  let rank = 0;
  return rows.map((row, i) => {
    if (i === 0 || row.tables !== rows[i - 1].tables || row.top !== rows[i - 1].top) rank = i + 1;
    return { ...row, rank };
  });
}

/** /c/<name> on the near.* host, /near/c/<name> elsewhere (see next.config.ts). */
export function clanUrl(name: string): string {
  const base = window.location.pathname.startsWith("/near") ? "/near" : "";
  return `${window.location.origin}${base}/c/${name}`;
}

export function clanPath(name: string): string {
  return `/near/c/${name}`;
}

export function clanInvitePost(name: string): string {
  return `Join my clan ${name} on Kova. Every table we play counts for the clan; the top clan of the day takes a double share of CHIP's daily mint.\n\n${SHARE_TAGS}`;
}

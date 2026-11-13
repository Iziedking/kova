"use client";

/**
 * Taking a seat, playing the House and opening a table for friends. Every pick is saved in this
 * browser before its transaction, so a closed tab never loses a sealed pick, and is sent to the
 * settler right after the seat lands.
 */
import { useEffect } from "react";
import { CHIP, type ChipCallResult, type ChipTable, failureMessage, newSalt, openedTableId, pickCommitment } from "@/adapters/near/chip";
import { callOpenSeconds, callRoundSeconds } from "@/adapters/near/launch-calls";
import { currentStore, deliverPick, pickStore } from "./picks";

type Caller = { call: <T = unknown>(method: string, args: Record<string, unknown>) => Promise<ChipCallResult<T>> };

export type SeatOutcome = { ok: boolean; tableId?: string; tone: "danger" | "info" | "warning"; text?: string; link?: string };

/** A friend table stays open for the contract's longest window, so a link has time to travel. */
export const FRIEND_OPEN_SECONDS = 600;
/** Where a host's pick waits while open_table is in flight, before the table has an id. */
const PENDING_TABLE = "pending-open";

function remember(accountId: string, tableId: string) {
  try {
    window.localStorage.setItem(currentStore(accountId), tableId);
  } catch {
    // The table is still on chain; the tables page lists it from there.
  }
}

export async function takeSeat(near: Caller, accountId: string, tableId: string, market: string): Promise<SeatOutcome> {
  const salt = newSalt();
  window.localStorage.setItem(pickStore(accountId, tableId), JSON.stringify({ market, salt }));
  const commitment = await pickCommitment(accountId, market, salt);
  const joined = await near.call("join_table", { table_id: tableId, commitment });
  if (!joined.success) return { ok: false, tone: "danger", text: failureMessage(joined.failure), link: joined.explorerUrl || undefined };
  remember(accountId, tableId);
  const delivered = await deliverPick(tableId, accountId);
  if (!delivered.ok) return { ok: true, tableId, tone: "warning", text: `You are seated, but the pick did not reach the settler yet: ${delivered.message}. Use "Send my pick again" on the table.` };
  return { ok: true, tableId, tone: "info" };
}

export async function playTheHouse(near: Caller, accountId: string, input: { market: string; stake: number; roundSeconds: number; callMemeId?: number }): Promise<SeatOutcome> {
  const body = input.callMemeId !== undefined ? { stakeChip: input.stake, roundSeconds: input.roundSeconds, callMemeId: input.callMemeId } : { stakeChip: input.stake, roundSeconds: input.roundSeconds };
  const response = await fetch("/api/near/house-table", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const reply = response ? ((await response.json().catch(() => ({}))) as { tableId?: string; error?: { message: string } }) : {};
  if (!response?.ok || !reply.tableId) return { ok: false, tone: "warning", text: reply.error?.message ?? "The House could not open a table. Try again in a moment." };
  return takeSeat(near, accountId, reply.tableId, input.market);
}

export async function openFriendTable(
  near: Caller,
  accountId: string,
  input: { market: string; stake: number; seats: number; roundSeconds: number; callEndsAt?: number },
): Promise<SeatOutcome> {
  // A call table runs until the auction ends, and must fill while it still cooks.
  const roundSeconds = input.callEndsAt !== undefined ? callRoundSeconds(input.callEndsAt, Date.now()) : input.roundSeconds;
  const openSeconds = input.callEndsAt !== undefined ? callOpenSeconds(input.callEndsAt, Date.now(), FRIEND_OPEN_SECONDS) : FRIEND_OPEN_SECONDS;
  if (roundSeconds === null || openSeconds === null) return { ok: false, tone: "warning", text: "This auction ends too soon for a call table. Pick another call or a coin." };
  const pending = pickStore(accountId, PENDING_TABLE);
  const salt = newSalt();
  const pick = JSON.stringify({ market: input.market, salt });
  window.localStorage.setItem(pending, pick);
  const commitment = await pickCommitment(accountId, input.market, salt);
  const opened = await near.call<string>("open_table", { stake: (BigInt(input.stake) * CHIP).toString(), seats: input.seats, round_seconds: roundSeconds, open_seconds: openSeconds, commitment });
  if (!opened.success) {
    window.localStorage.removeItem(pending);
    return { ok: false, tone: "danger", text: failureMessage(opened.failure), link: opened.explorerUrl || undefined };
  }
  const tableId = openedTableId(opened);
  if (!tableId) return { ok: false, tone: "warning", text: "The table opened, but its number was not in the reply. It appears under Tables in a few seconds.", link: opened.explorerUrl };
  window.localStorage.setItem(pickStore(accountId, tableId), pick);
  window.localStorage.removeItem(pending);
  remember(accountId, tableId);
  const delivered = await deliverPick(tableId, accountId);
  if (!delivered.ok) return { ok: true, tableId, tone: "warning", text: `The table is open, but your pick did not reach the settler yet: ${delivered.message}. Use "Send my pick again" on the table.` };
  return { ok: true, tableId, tone: "info" };
}

/**
 * If a tab closed while open_table was in flight, the host's pick is still under the pending key.
 * Once the new table shows up with the matching commitment, file the pick under its id and send it.
 */
export function usePendingPickRecovery(accountId: string | null, tables: ChipTable[] | null) {
  useEffect(() => {
    if (!accountId || !tables) return;
    const raw = window.localStorage.getItem(pickStore(accountId, PENDING_TABLE));
    if (!raw) return;
    void (async () => {
      const pick = JSON.parse(raw) as { market: string; salt: string };
      const commitment = await pickCommitment(accountId, pick.market, pick.salt);
      const table = tables.find((t) => t.players.some((p) => p.player === accountId && p.commitment === commitment));
      if (!table) return;
      window.localStorage.setItem(pickStore(accountId, table.id), raw);
      window.localStorage.removeItem(pickStore(accountId, PENDING_TABLE));
      void deliverPick(table.id, accountId);
    })();
  }, [accountId, tables]);
}

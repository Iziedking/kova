"use client";

/**
 * Shared reads for the Kova v3 pages: one GridClient, and the signed-in player's CHIP v3 state
 * (balance, whether the starter CHIP was claimed, whether the game key is on).
 */
import { GRID_CHIP, GridClient } from "@/adapters/near/grid";
import { useNear } from "../near-session";
import { usePoll } from "../use-poll";

let client: GridClient | null = null;
export function getGrid(): GridClient {
  client ??= new GridClient();
  return client;
}

/** What stands between this player and a stake: sign in, then the game key, then CHIP to stake. */
export type GridStep = "sign_in" | "game_key" | "claim" | "ready";

export function useGridPlayer() {
  const near = useNear();
  const grid = getGrid();
  const accountId = near.status === "signed_in" ? near.accountId : null;
  const balance = usePoll(accountId ? () => grid.balance(GRID_CHIP, accountId) : null, 10_000, `grid-balance:${accountId}`);
  const claimed = usePoll(accountId ? () => grid.starterClaimed(accountId) : null, 30_000, `grid-claimed:${accountId}`);

  const keyActive = near.gridKeyState === "active";
  const loaded = balance.data !== null && claimed.data !== null;
  const hasChip = (balance.data ?? 0n) > 0n;
  const step: GridStep = !accountId
    ? "sign_in"
    : !keyActive
      ? "game_key"
      : loaded && !claimed.data && !hasChip
        ? "claim"
        : "ready";

  function refresh() {
    balance.refresh();
    claimed.refresh();
  }

  return { near, accountId, keyActive, chipBalance: balance.data, starterClaimed: claimed.data, loaded, hasChip, step, refresh };
}

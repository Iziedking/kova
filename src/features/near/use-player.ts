"use client";

/**
 * The signed-in player's state, read from the contract: CHIP balance, whether the starter chips were
 * claimed, any blind owed, and whether the game key is on. Every page that needs "can this player
 * play?" reads it here, so the header, the setup card and the play buttons always agree.
 */
import { useNear } from "./near-session";
import { usePoll } from "./use-poll";

export type PlayerStep = "sign_in" | "game_key" | "claim" | "ready";

export function usePlayer() {
  const near = useNear();
  const { chip, accountId } = near;
  const holder = usePoll(accountId ? () => chip.getHolder(accountId) : null, 6_000, `holder:${accountId}`);
  const balance = holder.data?.balance ?? null;
  const starterClaimed = holder.data?.starter_claimed ?? false;
  const keyActive = near.keyState === "active";
  const signedIn = near.status === "signed_in" && !!accountId;

  /** The one thing standing between this player and a table, if anything. */
  const step: PlayerStep = !signedIn ? "sign_in" : !keyActive ? "game_key" : !holder.data ? "ready" : !starterClaimed && (balance ?? 0n) === 0n ? "claim" : "ready";

  return {
    near,
    accountId: signedIn ? accountId : null,
    signedIn,
    keyActive,
    balance,
    hasChips: balance !== null && balance > 0n,
    starterClaimed,
    pendingBlind: holder.data?.pending_blind ?? 0n,
    loaded: !!holder.data,
    step,
    refresh: holder.refresh,
  };
}

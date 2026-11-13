"use client";

/** /leaderboard: players by net CHIP, and launch scouts, built from the contract's settled tables. */
import { NearLeaderboard } from "./near-leaderboard";
import { useNear } from "./near-session";

export function LeaderboardScreen() {
  const { accountId } = useNear();
  return (
    <div className="mx-auto w-full max-w-[760px] space-y-5 px-4 pb-16 pt-8 md:px-8">
      <header>
        <h1 className="font-display text-[34px] font-bold leading-tight tracking-[-0.02em] text-text-primary md:text-[40px]">Leaderboard</h1>
        <p className="mt-2 text-[16px] text-text-secondary">Every settled table, ranked by net CHIP. Launch scouts rank who called meme.cooking launches best.</p>
      </header>
      <NearLeaderboard limit={50} viewer={accountId} />
    </div>
  );
}

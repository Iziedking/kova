"use client";

import { UserPlus } from "lucide-react";
import Link from "next/link";
import { useViewer } from "@/features/auth/viewer";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/**
 * Bring-your-crew prompt. A signed-in player with a username shares their invite link; a friend who
 * finishes their first staked game earns them referral points (see /points).
 */
export function InviteCrewCard() {
  const viewer = useViewer();
  const code = viewer.identity?.username ?? null;

  async function invite() {
    const url = code ? `${window.location.origin}/?ref=${encodeURIComponent(code)}` : `${window.location.origin}/`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Kova: Poker for Meme Stocks", text: "Play markets with me on Kova.", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Couldn't copy the link. Copy it from the address bar.");
    }
  }

  return (
    <div className="relative overflow-hidden rounded-panel border border-border-subtle bg-surface-1 p-5">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-[radial-gradient(closest-side,rgba(124,77,255,0.32),transparent)]"
      />
      <p className="relative font-display text-[20px] font-bold leading-6 text-text-primary">Bring your crew.</p>
      <p className="relative mt-1 max-w-[260px] text-[15px] leading-6 text-text-secondary">
        {code ? "You get 100 points and your friend gets 50 when they finish their first staked game." : "Markets are more fun together."}
      </p>
      <div className="relative mt-4 flex flex-wrap items-center gap-3">
        <Button iconLeft={<UserPlus size={17} />} onClick={() => void invite()}>
          {code ? "Copy invite link" : "Invite Friends"}
        </Button>
        {code ? <Link href="/points" className="text-[13px] text-accent hover:underline">Your points</Link> : null}
      </div>
    </div>
  );
}

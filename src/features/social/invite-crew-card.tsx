"use client";

import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/** Bring-your-crew prompt. Shares the site link; there is no referral system to claim otherwise. */
export function InviteCrewCard() {
  async function invite() {
    const url = `${window.location.origin}/`;
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
      <p className="relative mt-1 max-w-[230px] text-[15px] leading-6 text-text-secondary">Markets are more fun together.</p>
      <Button className="relative mt-4" iconLeft={<UserPlus size={17} />} onClick={() => void invite()}>
        Invite Friends
      </Button>
    </div>
  );
}

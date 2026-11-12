"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * The challenge link for a table: /t/<id> on the near.* host, /near/t/<id> elsewhere (the near
 * host rewrites the short form, see next.config.ts).
 */
export function inviteUrl(tableId: string): string {
  const base = window.location.pathname.startsWith("/near") ? "/near" : "";
  return `${window.location.origin}${base}/t/${tableId}`;
}

/**
 * The invite link for an open table, with copy and (where the device has it) the system share
 * sheet. Rendered only in the browser, after the table has been read.
 */
export function ShareTable({ tableId, stake, seatsLeft }: { tableId: string; stake: string; seatsLeft: number }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const link = inviteUrl(tableId);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setFailed(false);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setFailed(true);
    }
  }

  async function share() {
    try {
      await navigator.share({ title: `Join table ${tableId} on Kova`, text: `I saved you a seat: ${stake} CHIP, best NEAR coin pick takes the pot.`, url: link });
    } catch {
      // Closing the share sheet is not an error worth showing.
    }
  }

  return (
    <div className="mt-5 rounded-xl border border-accent/40 bg-accent-soft p-4">
      <p className="text-[14px] font-semibold text-text-primary">
        Invite friends · {seatsLeft} {seatsLeft === 1 ? "seat" : "seats"} left
      </p>
      <p className="mt-0.5 text-[12px] leading-5 text-text-secondary">
        They sign in and take a seat at {stake} CHIP with their own sealed pick. The round starts when the table fills or the host starts it; if neither happens before seats close, every stake comes back.
</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor={`invite-${tableId}`}>
          Invite link for table {tableId}
        </label>
        <input
          id={`invite-${tableId}`}
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="num h-11 min-w-0 flex-1 rounded-lg border border-border-subtle bg-surface-1 px-3 text-[13px] text-text-primary"
        />
        <Button variant="secondary" iconLeft={copied ? <Check size={16} /> : <Copy size={16} />} onClick={() => void copy()}>
          {copied ? "Copied" : "Copy link"}
        </Button>
        {canShare ? (
          <Button variant="ghost" iconLeft={<Share2 size={16} />} onClick={() => void share()}>
            Share
          </Button>
        ) : null}
      </div>
      {failed ? <p className="mt-2 text-[12px] text-warning">Copying was blocked. Select the link and copy it by hand.</p> : null}
    </div>
  );
}

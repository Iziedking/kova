"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";
import { formatChip } from "@/adapters/near/chip";
import { type ShareSeat, burnLine, invitePost, resultLine, showdownPost, xPostUrl } from "@/adapters/near/share";
import { Button } from "@/components/ui/button";
import { HOUSE_ACCOUNT } from "./near-session";

/**
 * The challenge link for a table: /t/<id> on the near.* host, /near/t/<id> elsewhere (the near
 * host rewrites the short form, see next.config.ts).
 */
export function inviteUrl(tableId: string): string {
  const base = window.location.pathname.startsWith("/near") ? "/near" : "";
  return `${window.location.origin}${base}/t/${tableId}`;
}

/** Copies text to the clipboard. Returns false when the browser blocks it. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-6.4L6.4 22H3.3l7.3-8.3L1 2h6.4l4.4 5.9L18.9 2Zm-1.1 18h1.7L6.3 3.9H4.5L17.8 20Z" />
    </svg>
  );
}

function LinkActions({ link, post, label }: { link: string; post: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy() {
    const ok = await copyText(link);
    setFailed(!ok);
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 2_000);
  }

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor={`link-${label}`}>
          {label}
        </label>
        <input
          id={`link-${label}`}
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="num h-11 min-w-0 flex-1 basis-56 rounded-lg border border-border-subtle bg-surface-1 px-3 text-[13px] text-text-primary"
        />
        <Button variant="secondary" iconLeft={copied ? <Check size={16} /> : <Copy size={16} />} onClick={() => void copy()}>
          {copied ? "Copied" : "Copy link"}
        </Button>
        <a
          href={xPostUrl(post, link)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-border-strong px-4 text-[14px] font-semibold text-text-primary hover:bg-surface-3"
        >
          <XIcon /> Post on X
        </a>
        {canShare ? (
          <Button variant="ghost" iconLeft={<Share2 size={16} />} onClick={() => void navigator.share({ text: post, url: link }).catch(() => undefined)}>
            Share
          </Button>
        ) : null}
      </div>
      {failed ? <p className="mt-2 text-[12px] text-warning">Copying was blocked. Select the link and copy it by hand.</p> : null}
    </>
  );
}

/** The invite for an open table: the link, copy, a prefilled X post and the system share sheet. */
export function ShareTable({ tableId, stake, roundSeconds, seatsLeft }: { tableId: string; stake: bigint; roundSeconds: number; seatsLeft: number }) {
  return (
    <div className="mt-5 rounded-xl border border-accent/40 bg-accent-soft p-4">
      <p className="text-[14px] font-semibold text-text-primary">
        Challenge friends · {seatsLeft} {seatsLeft === 1 ? "seat" : "seats"} left
      </p>
      <p className="mt-0.5 text-[12px] leading-5 text-text-secondary">
        They sign in and take a seat at {formatChip(stake)} CHIP with their own sealed pick. The round starts when the table fills or the host starts it; if neither happens before seats close, every stake comes back.
      </p>
      <LinkActions link={inviteUrl(tableId)} post={invitePost({ tableId, stake, roundSeconds })} label={`Challenge link for table ${tableId}`} />
    </div>
  );
}

/** After the showdown: the result in words, the burn, and a prefilled post that links back to the table. */
export function ShowdownShare({ tableId, seats, viewer, burned, supply }: { tableId: string; seats: readonly ShareSeat[]; viewer: string | null; burned: bigint; supply: bigint | null }) {
  const post = showdownPost({ tableId, seats, viewer, house: HOUSE_ACCOUNT, burned, supply });
  return (
    <div className="mt-4 rounded-xl border border-border-subtle bg-surface-2 p-4">
      <p className="text-[14px] font-semibold text-text-primary">Share this showdown</p>
      <p className="mt-1 text-[13px] leading-5 text-text-secondary">
        {resultLine(tableId, seats, viewer, HOUSE_ACCOUNT)} {burnLine(burned, supply)}
      </p>
      <LinkActions link={inviteUrl(tableId)} post={post} label={`Link to table ${tableId}`} />
    </div>
  );
}

"use client";

import { ShieldCheck, Sparkles, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useViewer } from "@/features/auth/viewer";
import { shortAddress } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { CopyValue } from "@/components/ui/copy-value";
import { ResponsiveOverlay } from "@/components/ui/overlay";
import { InlineNotice } from "@/components/ui/states";

/**
 * Wallet sheet, in two modes:
 *  - `reason` set: a money action needs a wallet; explain why and offer one.
 *  - `reason` null: the viewer opened their wallet from the header.
 *
 * Wallets are progressive (blueprint 44.12): asked for only when an action moves
 * money. A player without one can create the built-in wallet in one tap, or
 * connect Phantom or another Solana wallet.
 */
export function WalletSheet({
  open,
  onOpenChange,
  reason,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: string | null;
}) {
  const viewer = useViewer();
  const connected = viewer.walletAddress !== null;
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = viewer.walletKind === "embedded" ? "Kova wallet (built in)" : "Solana wallet";

  async function create() {
    if (!viewer.actions.createWallet) return;
    setCreating(true);
    setError(null);
    const result = await viewer.actions.createWallet();
    setCreating(false);
    if (!result.ok) setError(result.message);
  }

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={connected ? "Your wallet" : "Get a wallet to play"}
      description={reason ?? (connected ? "Connected to Kova." : "Needed to stake ANSEM and collect winnings.")}
      footer={
        connected ? (
          <Button href="/portfolio" variant="secondary" block onClick={() => onOpenChange(false)}>
            Open portfolio
          </Button>
        ) : (
          <div className="space-y-2.5">
            {viewer.actions.createWallet ? (
              <Button block iconLeft={<Sparkles size={18} />} loading={creating} loadingLabel="Creating…" onClick={() => void create()}>
                Create my Kova wallet
              </Button>
            ) : null}
            <Button
              block
              variant={viewer.actions.createWallet ? "secondary" : "primary"}
              iconLeft={<Wallet size={18} />}
              onClick={() => viewer.actions.connectWallet()}
              disabled={(!viewer.authAvailable && !viewer.preview) || creating}
            >
              Connect Phantom or another wallet
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        {connected ? (
          <div className="flex items-center justify-between rounded-xl border border-border-subtle bg-surface-2 px-4 py-3">
            <CopyValue label={`${label} · tap to copy`} value={viewer.walletAddress!} display={shortAddress(viewer.walletAddress!)} className="-ml-3 px-3" />
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
              Connected
            </span>
          </div>
        ) : null}
        {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
        <div className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-2 px-4 py-3">
          <ShieldCheck size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          <p className="text-[14px] leading-5 text-text-secondary">
            {connected || !viewer.actions.createWallet
              ? "Your Kova account is your identity. Your wallet approves only actions that move money, and Kova never holds your keys."
              : "Your Kova wallet is made for you in a second: no extension, no seed phrase to write down now. Its key stays with you through Privy, and Kova never holds it. You approve every stake and claim yourself."}
          </p>
        </div>
        {!connected && !viewer.authAvailable && !viewer.preview ? (
          <p className="text-[13px] text-text-muted">
            Wallet connection isn&apos;t configured for this environment. <Link href="/markets" className="text-accent underline">Keep browsing</Link>
          </p>
        ) : null}
      </div>
    </ResponsiveOverlay>
  );
}

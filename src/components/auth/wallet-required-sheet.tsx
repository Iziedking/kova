"use client";

import { ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { useViewer } from "@/features/auth/viewer";
import { shortAddress } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ResponsiveOverlay } from "@/components/ui/overlay";

/**
 * Wallet sheet, in two modes:
 *  - `reason` set: a money action needs a wallet; explain why and connect.
 *  - `reason` null: the viewer opened their wallet from the header.
 *
 * Wallet connection is progressive (blueprint 44.12): only asked for at the
 * moment an action involves money, never as an unexplained technical step.
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

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={connected ? "Your wallet" : "Connect a Solana wallet"}
      description={reason ?? (connected ? "Connected to Kova." : "Needed to stake ANSEM and trade.")}
      footer={
        connected ? (
          <Button href="/portfolio" variant="secondary" block onClick={() => onOpenChange(false)}>
            Open portfolio
          </Button>
        ) : (
          <Button block iconLeft={<Wallet size={18} />} onClick={() => viewer.actions.connectWallet()} disabled={!viewer.authAvailable && !viewer.preview}>
            Connect wallet
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {connected ? (
          <div className="flex items-center justify-between rounded-xl border border-border-subtle bg-surface-2 px-4 py-3">
            <div>
              <p className="text-[13px] text-text-secondary">Solana wallet</p>
              <p className="num text-[15px] font-medium text-text-primary">{shortAddress(viewer.walletAddress!)}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
              Connected
            </span>
          </div>
        ) : null}
        <div className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-2 px-4 py-3">
          <ShieldCheck size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          <p className="text-[14px] leading-5 text-text-secondary">
            Your Kova account is your identity. Your wallet is only asked to approve an action that moves money, and Kova never holds your keys.
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

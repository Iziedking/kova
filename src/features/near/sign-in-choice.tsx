"use client";

/**
 * The two ways into Kova on NEAR, side by side: your own wallet, or your email.
 * Used wherever a signed-out player is asked to sign in (the play page, a clan page).
 */
import { Mail, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNear } from "./near-session";

export function SignInChoice({ compact = false }: { compact?: boolean }) {
  const near = useNear();
  const busy = near.status === "loading";
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-2">
        <Button iconLeft={<Wallet size={16} />} onClick={() => void near.connect()} loading={busy && !near.progress} loadingLabel="Checking wallet…" disabled={!!near.progress}>
          Connect wallet
        </Button>
        {near.emailAvailable ? (
          <Button variant="secondary" iconLeft={<Mail size={16} />} onClick={() => near.connectEmail()} loading={!!near.progress} loadingLabel="Setting up…" disabled={busy && !near.progress}>
            Continue with email
          </Button>
        ) : null}
      </div>
      {near.progress ? (
        <p role="status" className="text-[13px] text-text-secondary">
          {near.progress}
        </p>
      ) : null}
      {!compact && near.emailAvailable ? (
        <p className="text-[12px] leading-5 text-text-muted">
          A wallet keeps your own keys. With email, Privy keeps a NEAR testnet wallet for your email and Kova never sees its key; a new email account gets a little testnet NEAR from Kova to start.
        </p>
      ) : null}
    </div>
  );
}

/** "Signed in with email (you@x.com)" or nothing, for the line under a signed-in step. */
export function SignedInWith() {
  const near = useNear();
  if (near.status !== "signed_in") return null;
  return near.method === "email" ? (
    <p className="text-[12px] text-text-muted">Signed in with email{near.email ? ` (${near.email})` : ""}. Privy keeps this account&apos;s wallet.</p>
  ) : null;
}

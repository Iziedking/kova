"use client";

import { Droplets } from "lucide-react";
import { useState } from "react";
import { useViewer } from "@/features/auth/viewer";
import { useRequireAuth } from "@/features/auth/use-require-auth";
import { useShell } from "@/components/shell/shell-context";
import { loadServices } from "@/services";
import { formatAnsemRaw } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { InlineNotice } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";

/**
 * Devnet faucet. Sends 10 TEST ANSEM and a little devnet SOL to the viewer's wallet
 * after it signs the ownership message. Once a day per wallet and per account.
 */
export function TestTokensButton() {
  const viewer = useViewer();
  const shell = useShell();
  const requireAuth = useRequireAuth();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "info" | "danger"; text: string } | null>(null);

  async function claim() {
    setBusy(true);
    setResult(null);
    const services = await loadServices();
    const granted = await services.competitions.claimTestTokens({ getAccessToken: viewer.getAccessToken, wallet: viewer.gameWallet });
    setBusy(false);
    if (!granted.ok) {
      setResult({ tone: "danger", text: granted.error.message });
      return;
    }
    const sol = (granted.data.lamports / 1e9).toFixed(2);
    setResult({ tone: "info", text: `${formatAnsemRaw(granted.data.amountRaw)} (TEST) and ${sol} devnet SOL sent to your wallet.` });
    toast.success("Test tokens sent");
  }

  function start() {
    requireAuth(
      () => shell.requireWallet("Test tokens go to your Solana wallet. Set it to devnet.", () => void claim()),
      { next: typeof window === "undefined" ? "/play" : window.location.pathname },
    );
  }

  return (
    <div className="space-y-2">
      <Button variant="secondary" size="sm" iconLeft={<Droplets size={15} />} loading={busy} loadingLabel="Sending…" onClick={start}>
        Get test tokens
      </Button>
      {result ? <InlineNotice tone={result.tone}>{result.text}</InlineNotice> : null}
    </div>
  );
}

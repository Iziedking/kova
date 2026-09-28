"use client";

import { Wallet } from "lucide-react";
import { useState } from "react";
import { useViewer } from "@/features/auth/viewer";
import { loadServices } from "@/services";
import { formatAnsemRaw } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { InlineNotice } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";

/**
 * Claims the viewer's payout (settled table) or refund (cancelled table). The backend
 * builds the transaction; the viewer's wallet signs and sends it. A second claim is
 * refused on chain, and a wallet with nothing to claim is told so.
 */
export function ClaimButton({ tableId, label }: { tableId: string; label: string }) {
  const viewer = useViewer();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const services = await loadServices();
    const result = await services.competitions.claim(tableId, { getAccessToken: viewer.getAccessToken, wallet: viewer.gameWallet });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    const what = result.data.kind === "payout" ? "Winnings" : "Refund";
    setDone(`${what} of ${formatAnsemRaw(result.data.amountRaw)} sent to your wallet (${result.data.signature.slice(0, 8)}…).`);
    toast.success(`${what} claimed`);
  }

  if (viewer.status !== "authed") return null;
  if (done) return <InlineNotice tone="info">{done}</InlineNotice>;
  return (
    <div className="space-y-2">
      <Button block size="lg" iconLeft={<Wallet size={17} />} loading={busy} loadingLabel="Waiting for your wallet…" onClick={() => void run()}>
        {label}
      </Button>
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
    </div>
  );
}

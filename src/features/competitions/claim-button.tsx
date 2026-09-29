"use client";

import { Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
function ClaimAction({ tableId, label, onConfirmed }: { tableId: string; label: string; onConfirmed?: () => void }) {
  const viewer = useViewer();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const services = await loadServices();
      const result = await services.competitions.claim(tableId, { getAccessToken: viewer.getAccessToken, accountId: viewer.userId, wallet: viewer.gameWallet, onClaimProgress: () => { if (alive.current) setConfirming(true); } });
      if (!alive.current) return;
      if (!result.ok) { setError(result.error.message); return; }
      const what = result.data.kind === "payout" ? "Winnings" : "Refund";
      setDone(what + " of " + formatAnsemRaw(result.data.amountRaw) + " confirmed in your wallet.");
      toast.success(what + " claimed");
      onConfirmed?.();
    } catch {
      if (alive.current) setError("Claim status couldn't load. Try again to check it.");
    } finally { if (alive.current) { setBusy(false); setConfirming(false); } }
  }

  if (viewer.status !== "authed") return null;
  if (done) return <InlineNotice tone="info">{done}</InlineNotice>;
  return (
    <div className="space-y-2">
      <Button block size="lg" iconLeft={<Wallet size={17} />} loading={busy} loadingLabel={confirming ? "Confirming your claim…" : "Waiting for your wallet…"} onClick={() => void run()}>
        {label}
      </Button>
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
    </div>
  );
}

export function ClaimButton(props: { tableId: string; label: string; onConfirmed?: () => void }) {
  const viewer = useViewer();
  return <ClaimAction key={viewer.userId + ":" + viewer.gameWallet?.address + ":" + props.tableId} {...props} />;
}

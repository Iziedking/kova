"use client";

import { FormEvent, useState } from "react";

const samplePool = "Ak7oAUqQ9jYu5YvfmDrtDC3WHi7BcN5Y4k8Bh3yk4B5e";
const sampleProgram = "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK";
const sampleMint = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";

export default function AutopilotForm() {
  const [wallet, setWallet] = useState("");
  const [cap, setCap] = useState("500");
  const [slippage, setSlippage] = useState("50");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    const response = await fetch("/api/wallet/privy/delegation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      id: `mandate-${Date.now()}`, wallet, allowedPools: [samplePool], allowedPrograms: [sampleProgram], allowedMints: [sampleMint], maxPositionUsdMicro: `${Math.round(Number(cap) * 1_000_000)}`, maxSlippageBps: Number(slippage), returnAddress: wallet, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
    }) });
    const result = await response.json() as { message?: string; code?: string };
    setMessage(response.ok ? "Delegation ready." : `${result.message ?? "Privy is not enabled yet."} (${result.code ?? "UNKNOWN"})`); setBusy(false);
  }

  return <form className="mandate-card" onSubmit={submit}>
    <div className="card-heading"><div><p className="eyebrow">MANDATE PREVIEW</p><h2>Review your limits</h2></div><span className="status-chip">PRIVY / SOLANA</span></div>
    <label>Wallet address<input required value={wallet} onChange={(event) => setWallet(event.target.value)} placeholder="Your Solana address" /></label>
    <div className="form-grid"><label>Position cap (USD)<input required inputMode="decimal" min="1" type="number" value={cap} onChange={(event) => setCap(event.target.value)} /></label><label>Max slippage (bps)<input required inputMode="numeric" min="0" max="1000" type="number" value={slippage} onChange={(event) => setSlippage(event.target.value)} /></label></div>
    <dl className="mandate-summary"><div><dt>Allowed market</dt><dd>NVDGE / NVDAx</dd></div><div><dt>Allowed venue</dt><dd>Raydium CLMM</dd></div><div><dt>Authority</dt><dd>7-day delegation</dd></div><div><dt>Recovery</dt><dd>Same wallet</dd></div></dl>
    <p className="disclosure">The agent can only act inside these limits. You can revoke the delegation. Every action will be simulated and reconciled before it is shown as complete.</p>
    <button className="primary-button" disabled={busy}>{busy ? "Checking mandate…" : "Enable Privy autopilot"}</button>
    {message ? <p className="form-message" role="status">{message}</p> : null}
  </form>;
}

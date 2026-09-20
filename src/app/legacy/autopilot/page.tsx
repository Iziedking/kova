import Link from "next/link";

export default function AutopilotPage() {
  return <main className="autopilot-page kova-legacy">
    <p className="wordmark">KOVA<span aria-hidden="true">/</span></p>
    <Link className="back-link" href="/legacy/markets">Back to markets</Link>
    <section className="autopilot-intro" aria-labelledby="autopilot-title">
      <p className="eyebrow">AGENT MANAGEMENT</p>
      <h1 id="autopilot-title">Agent management<br />is not enabled yet.</h1>
    <p>KOVA is currently a read-only preview. The agent can explain a market and show a bounded review, but it cannot hold keys, sign transactions or rebalance a position for you.</p>
    </section>
    <section className="mandate-card" aria-labelledby="autopilot-status-title">
      <div className="card-heading"><div><p className="eyebrow">PREVIEW CAPABILITY</p><h2 id="autopilot-status-title">No delegation request is available.</h2></div><span className="status-chip">UNAVAILABLE</span></div>
      <dl className="mandate-summary"><div><dt>Wallet custody</dt><dd>User-owned</dd></div><div><dt>Agent signing</dt><dd>Unavailable</dd></div><div><dt>Automatic rebalancing</dt><dd>Unavailable</dd></div><div><dt>Funds changed</dt><dd>No</dd></div></dl>
      <p className="disclosure">You can still inspect supported campaigns and review the evidence, risks and proposed limits for a market. A future write flow will require a complete feasibility proof, an unsigned simulation and your wallet confirmation.</p>
      <Link className="primary-button" href="/legacy/markets">Browse supported markets <span aria-hidden="true">↗</span></Link>
    </section>
  </main>;
}

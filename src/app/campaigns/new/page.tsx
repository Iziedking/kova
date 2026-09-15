import Link from "next/link";

export default function NewCampaignPage() {
  return <main className="autopilot-page">
    <p className="wordmark">FLOAT<span aria-hidden="true">/</span></p>
    <Link className="back-link" href="/">Back to markets</Link>
    <section className="autopilot-intro" aria-labelledby="campaign-title">
      <p className="eyebrow">PROJECT CAMPAIGNS</p>
      <h1 id="campaign-title">Campaign publishing<br />is not enabled yet.</h1>
      <p>The preview catalog can show how projects compete for liquidity, but FLOAT does not accept creator submissions or treat an ANSEM commitment as funded without verified authority and balance evidence.</p>
    </section>
    <section className="mandate-card" aria-labelledby="campaign-status-title">
      <div className="card-heading"><div><p className="eyebrow">PREVIEW CAPABILITY</p><h2 id="campaign-status-title">No campaign has been created.</h2></div><span className="status-chip">UNAVAILABLE</span></div>
      <dl className="mandate-summary"><div><dt>Creator submission</dt><dd>Unavailable</dd></div><div><dt>ANSEM authority</dt><dd>Unverified</dd></div><div><dt>Reward funding</dt><dd>Unverified</dd></div><div><dt>User capital</dt><dd>Not accepted</dd></div></dl>
      <p className="disclosure">You can inspect the captured campaigns and the evidence limits behind their status. A future publishing flow will require a supported market, verified creator authority and a funded schedule that can be read back from Solana.</p>
      <Link className="primary-button" href="/">Browse supported markets <span aria-hidden="true">↗</span></Link>
    </section>
  </main>;
}

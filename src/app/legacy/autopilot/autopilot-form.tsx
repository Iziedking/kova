import Link from "next/link";

export default function AutopilotForm() {
  return <section className="mandate-card" aria-labelledby="autopilot-fallback-title">
    <div className="card-heading"><div><p className="eyebrow">PREVIEW CAPABILITY</p><h2 id="autopilot-fallback-title">No delegation request is available.</h2></div><span className="status-chip">UNAVAILABLE</span></div>
    <p className="disclosure">KOVA does not accept delegated signing or automatic rebalancing in this build. Review a supported market to inspect the user-owned boundary.</p>
    <Link className="primary-button" href="/legacy/markets">Browse supported markets <span aria-hidden="true">↗</span></Link>
  </section>;
}

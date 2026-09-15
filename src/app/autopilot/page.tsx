import AutopilotForm from "./autopilot-form";
import Link from "next/link";

export default function AutopilotPage() {
  return <main className="autopilot-page">
    <p className="wordmark">FLOAT<span aria-hidden="true">/</span></p>
    <Link className="back-link" href="/">Back to markets</Link>
    <section className="autopilot-intro" aria-labelledby="autopilot-title">
      <p className="eyebrow">AGENT-MANAGED LIQUIDITY</p>
      <h1 id="autopilot-title">Let FLOAT manage<br />within your limits.</h1>
      <p>One Privy approval can let the agent rebalance while you are away. Your wallet, markets, cap and recovery address stay explicit.</p>
    </section>
    <AutopilotForm />
  </main>;
}

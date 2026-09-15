import { MARKET_CATALOG } from "../domain/market-catalog";
import { CAMPAIGN_CATALOG } from "../domain/campaign-catalog";

export default function Home() {
  return <main>
    <p className="wordmark">FLOAT<span aria-hidden="true">/</span></p>
    <h1>Back the markets<br />you believe in.</h1>
      <p>Stock-paired liquidity, reviewed before you commit.</p>
      <a className="primary-button" href="/autopilot">Review agent-managed backing</a>
      <section className="market-list" aria-labelledby="markets">
        <div className="section-heading"><div><p className="eyebrow">CAPTURED MARKET SNAPSHOT</p><h2 id="markets">Find a market people may trade.</h2></div><span className="status-chip">RESEARCH DATA</span></div>
        <p className="snapshot-note">These identities and metrics were captured for the build on 15 September 2026. Refresh before making a decision.</p>
        <div className="market-grid">{MARKET_CATALOG.map((market) => { const campaign = CAMPAIGN_CATALOG.find((item) => item.marketId === market.id); return <article className="market-card" key={market.id}><div className="market-card-top"><span className="market-symbol">{market.pair}</span><span className="risk">{campaign?.agentRating ?? market.riskLabel}</span></div><p>{market.community}</p><dl><div><dt>Backed</dt><dd>{campaign ? `$${(Number(campaign.backedUsdMicro) / 1_000_000).toLocaleString()}` : "Unavailable"}</dd></div><div><dt>24h volume</dt><dd>{market.volume24hUsdMicro ? `$${(Number(market.volume24hUsdMicro) / 1_000_000).toLocaleString()}` : "Unavailable"}</dd></div></dl><p className="campaign-boost">{campaign ? `${(Number(campaign.rewardBudgetRaw) / 1_000_000).toLocaleString()} ANSEM boost` : "No campaign"}</p><a href={`/markets/${market.id}`}>View market →</a></article>})}</div>
      </section>
    <section aria-labelledby="status">
      <h2 id="status">In development</h2>
      <p>Backing, rewards and LP management are not available yet.</p>
    </section>
  </main>;
}

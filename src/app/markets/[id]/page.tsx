import Link from "next/link";
import { notFound } from "next/navigation";
import { CAMPAIGN_CATALOG } from "../../../domain/campaign-catalog";
import { marketById, MARKET_CATALOG } from "../../../domain/market-catalog";

export function generateStaticParams() {
  return MARKET_CATALOG.map((market) => ({ id: market.id }));
}

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const market = marketById(id);
  if (!market) notFound();
  const campaign = CAMPAIGN_CATALOG.find((item) => item.marketId === market.id);
  return <main className="autopilot-page">
    <Link className="back-link" href="/">← All markets</Link>
    <p className="eyebrow">MARKET REVIEW · CAPTURED SNAPSHOT</p>
    <h1>{market.pair}</h1>
    <div className="mandate-card">
      <div className="card-heading"><div><p className="eyebrow">{market.community}</p><h2>{campaign ? "A project is seeking liquidity" : "No active campaign"}</h2></div><span className="status-chip">{market.riskLabel}</span></div>
      <dl className="mandate-summary"><div><dt>Backed</dt><dd>{campaign ? `$${(Number(campaign.backedUsdMicro) / 1_000_000).toLocaleString()}` : "Unavailable"}</dd></div><div><dt>Target</dt><dd>{campaign ? `$${(Number(campaign.targetUsdMicro) / 1_000_000).toLocaleString()}` : "Unavailable"}</dd></div><div><dt>ANSEM boost</dt><dd>{campaign ? (Number(campaign.rewardBudgetRaw) / 1_000_000).toLocaleString() : "None"}</dd></div><div><dt>Data status</dt><dd>Captured</dd></div></dl>
      <p className="disclosure">The agent can review a bounded strategy, but this snapshot does not approve capital or prove a live exit quote.</p>
      <Link className="primary-button" href={`/autopilot?market=${market.id}`}>Review backing limits</Link>
    </div>
  </main>;
}

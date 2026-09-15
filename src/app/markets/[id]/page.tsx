import { notFound } from "next/navigation";
import Link from "next/link";
import { MARKET_CATALOG } from "../../../domain/market-catalog";
import { loadMarketDossier } from "../../../server/market-dossier";
import { MarketFlow } from "./market-flow";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return MARKET_CATALOG.map((market) => ({ id: market.id }));
}

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await loadMarketDossier(id);
  if (!result.ok && result.code === "MARKET_NOT_FOUND") notFound();
  if (!result.ok) {
    return <main className="dossier-page"><section className="dossier-shell"><p className="eyebrow">FLOAT / MARKET DOSSIER</p><h1>Market data unavailable.</h1><p>{result.message}</p><Link className="dossier-back" href="/">← All markets</Link></section></main>;
  }
  return <main className="dossier-page"><MarketFlow market={result.dossier.market} campaign={result.dossier.campaign ?? undefined} /></main>;
}

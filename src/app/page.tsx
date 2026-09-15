"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CAMPAIGN_CATALOG } from "../domain/campaign-catalog";
import { MARKET_CATALOG, type DiscoverMarket } from "../domain/market-catalog";
import { FloatLogo } from "./float-logo";

function usd(microUsd: string | null | undefined) {
  if (!microUsd) return "—";
  const value = Number(microUsd) / 1_000_000;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: value >= 1000 ? 0 : 2 })}`;
}

function ansem(raw: string | null | undefined) {
  if (!raw) return "—";
  return `${(Number(raw) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 0 })} ANSEM`;
}

function shortAddress(address: string) {
  return `${address.slice(0, 5)}…${address.slice(-4)}`;
}

function DepthCrossSection({ market }: { market: DiscoverMarket }) {
  return <div className="depth-object" aria-label="Illustrative liquidity depth cross-section">
    <div className="depth-object-header"><span>FLOAT / DEPTH CROSS-SECTION</span><span className="object-note">ILLUSTRATIVE · CAPTURED {market.snapshotAt.slice(0, 10)}</span></div>
    <svg viewBox="0 0 760 330" role="img" aria-labelledby="depth-title depth-desc">
      <title id="depth-title">Proposed capital against measured exit capacity</title>
      <desc id="depth-desc">The copper band shows a proposed position. The orange curve shows independently measured stock exit capacity. It is not a guarantee of execution.</desc>
      <defs>
        <linearGradient id="depth-band" x1="0" x2="1"><stop offset="0" stopColor="#D9772B" stopOpacity=".08" /><stop offset=".7" stopColor="#D9772B" stopOpacity=".74" /><stop offset="1" stopColor="#D9772B" stopOpacity=".18" /></linearGradient>
        <linearGradient id="depth-capacity" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#F28C28" stopOpacity=".32" /><stop offset="1" stopColor="#F28C28" stopOpacity="0" /></linearGradient>
        <pattern id="depth-grid" width="76" height="55" patternUnits="userSpaceOnUse"><path d="M76 0H0V55" fill="none" stroke="#fff" strokeOpacity=".07" /></pattern>
      </defs>
      <rect width="760" height="330" fill="url(#depth-grid)" />
      <line x1="32" y1="254" x2="728" y2="254" stroke="#fff" strokeOpacity=".15" />
      <line x1="32" y1="166" x2="728" y2="166" stroke="#fff" strokeOpacity=".08" strokeDasharray="3 8" />
      <path d="M32 246C102 232 138 244 196 212s77-20 123-56 60 19 111-11 72-66 112-45 58-6 85-49 68-42 101-47V254H32Z" fill="url(#depth-capacity)" />
      <path className="depth-capacity-line" d="M32 246C102 232 138 244 196 212s77-20 123-56 60 19 111-11 72-66 112-45 58-6 85-49 68-42 101-47" fill="none" stroke="#F28C28" strokeWidth="2" />
      <path className="depth-proposed-band" d="M32 225H392V242H32Z" fill="url(#depth-band)" />
      <line x1="392" y1="206" x2="392" y2="262" stroke="#D9772B" strokeWidth="1" strokeDasharray="4 4" />
      <circle className="depth-node" cx="645" cy="102" r="5" fill="#F28C28" />
      <text x="32" y="294" className="depth-axis-label">LOWER EXIT CAPACITY</text><text x="608" y="294" className="depth-axis-label">HIGHER EXIT CAPACITY</text>
      <text x="42" y="217" className="depth-band-label">PROPOSED POSITION</text><text x="548" y="88" className="depth-curve-label">MEASURED STOCK EXIT DEPTH</text><text x="405" y="202" className="depth-value-label">CAPACITY CHECK</text>
    </svg>
    <div className="depth-object-footer"><span><i className="legend-mark legend-band" /> proposed deployed capital</span><span><i className="legend-mark legend-curve" /> measured exit capacity</span><span>NOT A GUARANTEE</span></div>
  </div>;
}

function MarketRow({ market, selected, onSelect }: { market: DiscoverMarket; selected: boolean; onSelect: () => void }) {
  const campaign = CAMPAIGN_CATALOG.find((item) => item.marketId === market.id);
  return <button type="button" className={`market-row${selected ? " is-selected" : ""}`} onClick={onSelect} aria-pressed={selected}>
    <span className="market-row-index">{selected ? "●" : "0" + (MARKET_CATALOG.indexOf(market) + 1)}</span><span className="market-row-content"><strong>{market.pair}</strong><small>{market.community}</small></span><span className="market-row-status">{campaign ? "CAMPAIGN" : "WATCH"}<i /></span>
  </button>;
}

export default function Home() {
  const [selectedId, setSelectedId] = useState(MARKET_CATALOG[0].id);
  const [community, setCommunity] = useState("All markets");
  const selected = MARKET_CATALOG.find((market) => market.id === selectedId) ?? MARKET_CATALOG[0];
  const campaign = CAMPAIGN_CATALOG.find((item) => item.marketId === selected.id);
  const communities = useMemo(() => ["All markets", ...MARKET_CATALOG.map((market) => market.community)], []);
  const selectedIndex = String(MARKET_CATALOG.indexOf(selected) + 1).padStart(2, "0");

  function selectCommunity(nextCommunity: string) {
    setCommunity(nextCommunity);
    const nextMarket = MARKET_CATALOG.find((market) => nextCommunity === "All markets" || market.community === nextCommunity);
    if (nextMarket) setSelectedId(nextMarket.id);
  }

  return <div className="float-studio">
    <header className="studio-header"><FloatLogo /><div className="studio-header-center"><span className="studio-mode"><i /> CAPTURED PREVIEW</span><span className="studio-network">SOLANA MAINNET · READ ONLY</span></div><div className="studio-header-actions"><span className="wallet-boundary">WALLET SIGNING OFF</span><Link className="studio-menu-link" href="/autopilot">Autopilot <span aria-hidden="true">↗</span></Link></div></header>
    <div className="studio-frame">
      <aside className="community-rail" aria-label="Market communities"><div className="rail-heading"><span>COMMUNITIES</span><span>{String(MARKET_CATALOG.length).padStart(2, "0")}</span></div><nav className="community-list">{communities.map((item) => <button key={item} type="button" className={community === item ? "active" : ""} onClick={() => selectCommunity(item)}>{item}<span>{item === "All markets" ? MARKET_CATALOG.length : 1}</span></button>)}</nav><div className="rail-rule" /><div className="rail-note"><span className="rail-note-index">01</span><p>FLOAT reads the pool before it asks you to back it.</p></div><Link className="rail-create" href="/campaigns/new"><span>+</span> Create a campaign</Link></aside>
      <main className="workspace-main"><div className="workspace-toolbar"><div><span className="section-index">01 / DISCOVER</span><h1>Markets worth backing.</h1></div><div className="toolbar-meta"><span>LAST CAPTURE</span><strong>15 SEP 2026</strong><span className="toolbar-refresh">↻ Refresh read</span></div></div><div className="workspace-subbar"><p>Compare market identity, measured depth and campaign intent before capital enters the conversation.</p><span>{community === "All markets" ? "2" : "1"} OBSERVED</span></div>
        <section className="market-selector" aria-labelledby="selector-title"><div className="selector-heading"><span id="selector-title">MARKET SELECTOR</span><span>SELECT ONE TO INSPECT</span></div><div className="market-row-list">{MARKET_CATALOG.filter((market) => community === "All markets" || market.community === community).map((market) => <MarketRow key={market.id} market={market} selected={market.id === selected.id} onSelect={() => setSelectedId(market.id)} />)}</div></section>
        <section className="selected-market" aria-labelledby="selected-title"><div className="selected-topline"><span className="section-index">SELECTED MARKET / {selectedIndex}</span><span className="captured-tag"><i /> CAPTURED SNAPSHOT</span></div><div className="selected-heading"><div><span className="market-community">{selected.community}</span><h2 id="selected-title">{selected.pair}</h2><p>{campaign ? "A campaign is seeking depth for this stock-paired market." : "A watched market with no active campaign."}</p></div><Link className="dossier-link" href={`/markets/${selected.id}`}>Open dossier <span aria-hidden="true">↗</span></Link></div><DepthCrossSection market={selected} /><div className="market-observations"><div><span>POOL DEPTH</span><strong>{usd(selected.tvlUsdMicro)}</strong><small>TVL at capture</small></div><div><span>24H FLOW</span><strong>{usd(selected.volume24hUsdMicro)}</strong><small>matched window</small></div><div><span>POOL VENUE</span><strong>RAYDIUM CLMM</strong><small>program checked</small></div><div><span>POOL IDENTITY</span><strong className="verified-text"><i /> VERIFIED</strong><small>{shortAddress(selected.pool)}</small></div></div></section>
      </main>
      <aside className="decision-rail" aria-label="Market evidence and decision"><div className="decision-rail-head"><span>DECISION RAIL</span><span>02 / 04</span></div><div className="decision-status"><span className="status-symbol">!</span><div><span className="section-index">AGENT POSTURE</span><strong>REVIEW REQUIRED</strong><p>Evidence is captured. A bounded proposal is available, but no capital is moved in preview.</p></div></div><div className="evidence-list"><div className="evidence-item"><span className="evidence-number">01</span><div><strong>Identity checked</strong><small>{selected.stockSymbol} · exact mint resolved</small></div><span className="evidence-state">PASS</span></div><div className="evidence-item"><span className="evidence-number">02</span><div><strong>Pool verified</strong><small>Raydium CLMM · {shortAddress(selected.pool)}</small></div><span className="evidence-state">PASS</span></div><div className="evidence-item"><span className="evidence-number">03</span><div><strong>Exit capacity</strong><small>Independent measurement required</small></div><span className="evidence-state pending">CHECK</span></div><div className="evidence-item"><span className="evidence-number">04</span><div><strong>Incentive scope</strong><small>{ansem(campaign?.rewardBudgetRaw)} · proposed, not funded</small></div><span className="evidence-state pending">OPEN</span></div></div><div className="decision-card"><div className="decision-card-top"><span>CAMPAIGN SIGNAL</span><span className={campaign ? "signal-open" : "signal-muted"}><i /> {campaign ? "SEEKING INTEREST" : "NO CAMPAIGN"}</span></div><strong>{campaign ? "Help this market earn its float." : "Watch the market."}</strong><p>{campaign ? `${usd(campaign.backedUsdMicro)} of ${usd(campaign.targetUsdMicro)} expressed interest. The reward budget is not funding proof.` : "FLOAT will keep the market visible while its identity and activity remain checked."}</p>{campaign ? <dl><div><dt>BACKED</dt><dd>{usd(campaign.backedUsdMicro)}</dd></div><div><dt>TARGET</dt><dd>{usd(campaign.targetUsdMicro)}</dd></div></dl> : null}<Link className="decision-cta" href={`/markets/${selected.id}`}>{campaign ? "Review backing" : "View evidence"}<span aria-hidden="true">↗</span></Link></div><div className="rail-footer-note"><span>CAPABILITY BOUNDARY</span><p>Signing and live LP execution are disabled. Your wallet remains the authority.</p></div></aside>
    </div>
    <footer className="studio-footer"><span>FLOAT / LIQUIDITY WITH EVIDENCE</span><span>IDENTITY · DEPTH · AUTHORITY</span><span>PREVIEW BUILD / 01.0</span></footer>
  </div>;
}

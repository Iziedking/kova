"use client";

import { useState } from "react";
import Link from "next/link";
import type { DiscoverMarket } from "../../../domain/market-catalog";
import type { CampaignPreview } from "../../../domain/campaign-catalog";
import { MarketField } from "../../market-field";
import { connectSolanaWallet, discoverSolanaWallets, type ConnectedWallet, type DiscoveredWallet } from "../../../wallet/standard";

type ReviewStep = 1 | 2 | 3 | 4 | 5;

function usd(raw: string | null | undefined) {
  if (!raw) return "—";
  return `$${(Number(raw) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function ansem(raw: string | undefined) {
  if (!raw) return "—";
  return `${(Number(raw) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 0 })} ANSEM`;
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-5)}`;
}

interface MarketFlowProps {
  market: DiscoverMarket;
  campaign?: CampaignPreview;
}

export function MarketFlow({ market, campaign }: MarketFlowProps) {
  const [isReviewOpen, setReviewOpen] = useState(false);
  const [step, setStep] = useState<ReviewStep>(1);
  const [capital, setCapital] = useState("500");
  const [range, setRange] = useState("balanced");
  const [expiry, setExpiry] = useState("7");
  const [wallets, setWallets] = useState<readonly DiscoveredWallet[]>([]);
  const [connectedWallet, setConnectedWallet] = useState<ConnectedWallet | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);

  function openReview() {
    setStep(1);
    setWallets(discoverSolanaWallets());
    setWalletError(null);
    setReviewOpen(true);
  }

  function closeReview() {
    setReviewOpen(false);
  }

  function nextStep() {
    if (step === 1 && connectedWallet === null) {
      setWalletError("Connect a Solana wallet before reviewing a user-owned position.");
      return;
    }
    setStep((current) => (current < 4 ? (current + 1) as ReviewStep : 5));
  }

  function previousStep() {
    setStep((current) => (current > 1 ? (current - 1) as ReviewStep : 1));
  }

  async function connectWallet(candidate: DiscoveredWallet) {
    setConnectingWallet(candidate.name);
    setWalletError(null);
    const result = await connectSolanaWallet(candidate);
    setConnectingWallet(null);
    if (!result.ok) {
      setWalletError(result.message);
      return;
    }
    setConnectedWallet(result.value);
  }

  return <>
    <section className="dossier-shell" aria-labelledby="dossier-title">
      <div className="dossier-topline"><Link className="dossier-back" href="/">← All markets</Link><span>{"/// MARKET DOSSIER"}</span><span className="dossier-captured">CAPTURED {new Date(market.snapshotAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).toUpperCase()}</span></div>
      <div className="dossier-grid">
        <div className="dossier-main">
          <p className="eyebrow">{market.community}</p>
          <div className="dossier-title-row"><h1 id="dossier-title">{market.pair}</h1><span className="status-chip">{market.riskLabel}</span></div>
          <p className="dossier-lede">A stock-paired market looking for depth. Review the activity field, campaign terms and agent posture before you decide whether it deserves your capital.</p>
          <div className="dossier-field-wrap"><MarketField stockSymbol={market.stockSymbol} memeSymbol={market.memeSymbol} /></div>
          <div className="dossier-stats"><div><span>TVL / CAPTURED</span><b>{usd(market.tvlUsdMicro)}</b></div><div><span>24H VOLUME</span><b>{usd(market.volume24hUsdMicro)}</b></div><div><span>VENUE</span><b>RAYDIUM CLMM</b></div><div><span>IDENTITY</span><b>POOL VERIFIED</b></div></div>
        </div>
        <aside className="dossier-aside">
          <div className="dossier-aside-head"><span className="eyebrow">AGENT POSTURE</span><span className="dossier-dot"><i /> REVIEW REQUIRED</span></div>
          <h2>{campaign ? "A project is seeking liquidity." : "No active campaign."}</h2>
          <p>The agent will compare depth, volatility, activity and reference-price drift. It can propose a bounded position, but it cannot override your mandate.</p>
          <div className="dossier-campaign"><div><span>CAMPAIGN TARGET</span><b>{usd(campaign?.targetUsdMicro)}</b></div><div><span>BACKED SO FAR</span><b>{usd(campaign?.backedUsdMicro)}</b></div><div><span>ANSEM BOOST</span><b className="boost-value">{ansem(campaign?.rewardBudgetRaw)}</b></div></div>
          <button className="primary-button dossier-cta" type="button" onClick={openReview}>Review backing <span aria-hidden="true">↗</span></button>
          <p className="dossier-disclosure">Captured campaign preview. No user funds are held and no live LP position is created in this build.</p>
          <a className="dossier-pool-link" href={`https://solscan.io/account/${market.pool}`} target="_blank" rel="noreferrer">Inspect pool identity <span aria-hidden="true">↗</span></a>
        </aside>
      </div>
    </section>

    {isReviewOpen ? <div className="flow-overlay" role="presentation"><section className="review-sheet" role="dialog" aria-modal="true" aria-labelledby="review-title">
      <div className="review-sheet-top"><div><span className="eyebrow">BACKING REVIEW</span><h2 id="review-title">{step === 5 ? "Handoff paused" : `Back ${market.pair}`}</h2></div><button className="sheet-close" type="button" onClick={closeReview} aria-label="Close backing review">×</button></div>
      {step < 5 ? <>
        <div className="review-progress" aria-label={`Step ${step} of 4`}><span className="review-progress-line"><i style={{ width: `${step * 25}%` }} /></span><span>0{step} / 04</span></div>
        {step === 1 ? <div className="review-step"><h3>Connect your wallet.</h3><p>FLOAT reads your wallet in the browser. You keep signing authority, and this preview never requests a signature or moves funds.</p><div className="wallet-connect-list">{wallets.length === 0 ? <p className="wallet-empty">No compatible Solana wallet was detected in this browser.</p> : wallets.map((candidate) => <button className="wallet-connect-option" disabled={connectingWallet !== null} key={candidate.name} type="button" onClick={() => void connectWallet(candidate)}><span>{candidate.name}</span><span>{connectingWallet === candidate.name ? "CONNECTING…" : "CONNECT"} ↗</span></button>)}</div>{connectedWallet ? <div className="wallet-connected"><span>CONNECTED · {connectedWallet.walletName}</span><b>{shortAddress(connectedWallet.address)} · {connectedWallet.chain === "solana:mainnet" ? "MAINNET" : "DEVNET"}</b></div> : null}{walletError ? <p className="wallet-error" role="alert">{walletError}</p> : null}<label>Maximum capital in USD<input autoFocus inputMode="decimal" min="1" type="number" value={capital} onChange={(event) => setCapital(event.target.value)} /></label><div className="review-note"><span>WHY THIS MATTERS</span><b>Capital is capped before a strategy is proposed.</b></div></div> : null}
        {step === 2 ? <div className="review-step"><h3>Choose a range.</h3><p>A tighter range earns more when price stays close. A wider range stays active through more movement.</p><div className="choice-list" role="radiogroup" aria-label="Liquidity range"><label className={range === "tight" ? "choice selected" : "choice"}><input type="radio" name="range" value="tight" checked={range === "tight"} onChange={() => setRange("tight")} /><span><b>Tight</b><small>Higher fee concentration · exits sooner</small></span></label><label className={range === "balanced" ? "choice selected" : "choice"}><input type="radio" name="range" value="balanced" checked={range === "balanced"} onChange={() => setRange("balanced")} /><span><b>Balanced</b><small>Default coverage · moderate movement</small></span></label><label className={range === "wide" ? "choice selected" : "choice"}><input type="radio" name="range" value="wide" checked={range === "wide"} onChange={() => setRange("wide")} /><span><b>Wide</b><small>More coverage · lower concentration</small></span></label></div></div> : null}
        {step === 3 ? <div className="review-step"><h3>Set an expiry.</h3><p>The agent stops acting when this period ends. You can withdraw or create a new mandate later.</p><label>Mandate duration<select value={expiry} onChange={(event) => setExpiry(event.target.value)}><option value="1">1 day</option><option value="7">7 days</option><option value="14">14 days</option></select></label><div className="review-note"><span>RECOVERY</span><b>Your return address stays the connected wallet.</b></div></div> : null}
        {step === 4 ? <div className="review-step"><h3>Review the agent mandate.</h3><p>This is the complete user-owned review boundary. Exact token debits and minimum receives stay withheld until a fresh executable quote exists.</p><dl className="mandate-readout"><div><dt>MARKET</dt><dd>{market.pair}</dd></div><div><dt>CAPITAL CAP</dt><dd>${Number(capital || 0).toLocaleString()} USD</dd></div><div><dt>RANGE</dt><dd>{range.toUpperCase()} · TICKS PENDING</dd></div><div><dt>EXPIRY</dt><dd>{expiry} DAYS</dd></div><div><dt>TOKEN DEBITS</dt><dd>WITHHELD · QUOTE INCOMPLETE</dd></div><div><dt>MINIMUM RECEIVES</dt><dd>WITHHELD · QUOTE INCOMPLETE</dd></div><div><dt>FEES / REWARDS</dt><dd>NOT VERIFIED</dd></div><div><dt>AUTHORITY</dt><dd>{connectedWallet ? shortAddress(connectedWallet.address) : "WALLET REQUIRED"}</dd></div></dl><div className="review-note"><span>KNOWN RISK</span><b>Thin stock-side exit depth and incomplete tick coverage can change execution or prevent it.</b></div></div> : null}
        <div className="review-actions"><button className="sheet-secondary" type="button" onClick={step === 1 ? closeReview : previousStep}>{step === 1 ? "Cancel" : "Back"}</button><button className="primary-button" disabled={step === 1 && connectedWallet === null} type="button" onClick={nextStep}>{step === 4 ? "Review wallet boundary" : "Continue"}<span aria-hidden="true">→</span></button></div>
      </> : <div className="review-step handoff-paused"><div className="paused-mark">!</div><h3>Wallet handoff is unavailable in preview.</h3><p>No signing request was created and no funds changed. The selected market, capital cap and expiry remain a review only.</p><div className="review-note"><span>PREVIEW CAPABILITY</span><b>Underwriting is available. Signing and transaction preparation are disabled.</b></div><div className="review-actions"><button className="sheet-secondary" type="button" onClick={closeReview}>Return to dossier</button><button className="primary-button" type="button" onClick={openReview}>Review again</button></div></div>}
    </section></div> : null}
  </>;
}

"use client";

import { useState } from "react";
import Link from "next/link";
import type { CampaignPreview } from "../../../domain/campaign-catalog";
import type { DiscoverMarket } from "../../../domain/market-catalog";
import type { MarketDossier } from "../../../server/market-dossier";
import { connectSolanaWallet, discoverSolanaWallets, type ConnectedWallet, type DiscoveredWallet } from "../../../wallet/standard";
import { MarketField } from "../../market-field";

type ReviewStep = 1 | 2 | 3 | 4 | 5;
type StockCheckReport = NonNullable<MarketDossier["evidence"]["stockCheck"]["report"]>;

interface MarketFlowProps {
  market: DiscoverMarket;
  campaign?: CampaignPreview;
  stockCheck: MarketDossier["evidence"]["stockCheck"];
}

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

function statusLabel(status: "pass" | "blocked" | "unknown") {
  return status === "pass" ? "Verified" : status === "blocked" ? "Blocked" : "Unknown";
}

function statusClass(status: "pass" | "blocked" | "unknown") {
  return status === "pass" ? "is-pass" : status === "blocked" ? "is-blocked" : "is-unknown";
}

function StockCheckRow({ number, title, detail, status }: { number: string; title: string; detail: string; status: "pass" | "blocked" | "unknown" }) {
  return <div className="stock-check-row">
    <span className="check-row-icon">{number}</span>
    <div><strong>{title}</strong><small>{detail}</small></div>
    <span className={`check-row-state ${statusClass(status)}`}>{statusLabel(status)}</span>
  </div>;
}

function StockCheckPanel({ market, stockCheck }: { market: DiscoverMarket; stockCheck: MarketDossier["evidence"]["stockCheck"] }) {
  const report = stockCheck.report as StockCheckReport | null;
  if (report === null) {
    return <section className="stock-check-panel" aria-labelledby="stock-check-title">
      <div className="stock-check-heading"><div><span className="eyebrow">FIRST GATE</span><h2 id="stock-check-title">Initial StockCheck</h2><p>KOVA needs current stock evidence before a market can ask users for liquidity.</p></div><span className="evidence-pill is-unknown">Unavailable</span></div>
      <div className="stock-check-unavailable"><strong>This check is unavailable.</strong><span>Backing is paused until KOVA can read the required stock evidence.</span></div>
    </section>;
  }

  const programName = report.stock.programId === market.stockProgramId && market.stockProgramId === "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" ? "Token-2022" : "SPL Token";
  const eligibilityDetail = report.eligibility.jurisdiction === "unknown" ? "Current jurisdiction coverage is unavailable." : `Jurisdiction: ${report.eligibility.jurisdiction}.`;
  const inventoryDetail = report.inventory.redeemability === "unavailable" ? "Issuer-wide inventory is not verified." : "Inventory evidence recorded.";
  const depthDetail = report.liquidity.thinLiquidity === "unknown" ? "Fixed-size exit capacity needs evidence." : `${report.liquidity.thinLiquidity} capacity watch.`;
  const summary = report.status === "unknown"
    ? "Backing stays paused until the unknown checks are resolved."
    : report.status === "blocked"
      ? "Backing is blocked by the evidence above."
      : "This check supports review, not a return or execution guarantee.";

  return <section className="stock-check-panel" aria-labelledby="stock-check-title">
    <div className="stock-check-heading"><div><span className="eyebrow">FIRST GATE</span><h2 id="stock-check-title">Initial StockCheck</h2><p>Before a market can ask for liquidity, KOVA checks the stock identity, eligibility, reference, inventory, and exit conditions.</p></div><span className={`evidence-pill ${statusClass(report.status)}`}>{statusLabel(report.status)}</span></div>
    <div className="stock-check-identity"><div><span>STOCK TOKEN</span><strong>{report.stock.symbol}</strong><code>{shortAddress(report.stock.tokenAddress)}</code></div><div><span>PROGRAM</span><strong>{programName}</strong><code>{report.stock.decimals} decimals</code></div><div><span>CHECKED</span><strong>{new Date(report.checkedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).toUpperCase()}</strong><code>{stockCheck.capability === "fixture_backed" ? "Captured preview" : "Finalized read"}</code></div></div>
    <div className="stock-check-grid">
      <StockCheckRow number="01" title="Issuer and exact address" detail={report.issuer.approvalStatus === "reported" ? "Address reported, independent approval pending." : "Exact issuer record checked."} status={report.issuer.status} />
      <StockCheckRow number="02" title="Eligibility and jurisdiction" detail={eligibilityDetail} status={report.eligibility.evidenceStatus} />
      <StockCheckRow number="03" title="Reference price" detail={report.reference.freshnessSeconds === null ? "No timestamped reference available." : `${report.reference.freshnessSeconds}s old at check.`} status={report.reference.status} />
      <StockCheckRow number="04" title="Inventory and redeemability" detail={inventoryDetail} status={report.inventory.status} />
      <StockCheckRow number="05" title="Stock-side exit depth" detail={depthDetail} status={report.liquidity.status} />
    </div>
    <div className="stock-check-footer"><span>{summary}</span><span>REPORT {stockCheck.reportHash ? `${stockCheck.reportHash.slice(0, 8)}…` : "—"}</span></div>
  </section>;
}

function ReviewSheet({ market, isOpen, step, capital, range, expiry, wallets, connectedWallet, walletError, connectingWallet, onClose, onNext, onBack, onCapitalChange, onRangeChange, onExpiryChange, onConnect }: {
  market: DiscoverMarket;
  isOpen: boolean;
  step: ReviewStep;
  capital: string;
  range: string;
  expiry: string;
  wallets: readonly DiscoveredWallet[];
  connectedWallet: ConnectedWallet | null;
  walletError: string | null;
  connectingWallet: string | null;
  onClose: () => void;
  onNext: () => void;
  onBack: () => void;
  onCapitalChange: (value: string) => void;
  onRangeChange: (value: string) => void;
  onExpiryChange: (value: string) => void;
  onConnect: (wallet: DiscoveredWallet) => void;
}) {
  if (!isOpen) return null;

  return <div className="flow-overlay" role="presentation"><section className="review-sheet" role="dialog" aria-modal="true" aria-labelledby="review-title">
    <div className="review-sheet-top"><div><span className="eyebrow">BACKING REVIEW</span><h2 id="review-title">{step === 5 ? "Wallet handoff" : `Back ${market.pair}`}</h2></div><button className="sheet-close" type="button" onClick={onClose} aria-label="Close backing review">×</button></div>
    <div className="review-progress" aria-label={step === 5 ? "Mandate review complete" : `Step ${step} of 4`}><span className="review-progress-line"><i style={{ width: `${Math.min(step, 4) * 25}%` }} /></span><span>{step === 5 ? "READY / 04" : `0${step} / 04`}</span></div>
    {step === 1 ? <div className="review-step"><h3>Set your capital limit.</h3><p>Choose the maximum amount you are willing to allocate. This is a review limit, not a deposit.</p><label>Maximum capital in USD<input autoFocus inputMode="decimal" min="1" type="number" value={capital} onChange={(event) => onCapitalChange(event.target.value)} /></label><div className="review-note"><span>WHY THIS MATTERS</span><b>Your capital cap is visible before any wallet or permission step.</b></div></div> : null}
    {step === 2 ? <div className="review-step"><h3>Choose a range.</h3><p>A tighter range concentrates liquidity near the current price. A wider range stays active through more movement.</p><div className="choice-list" role="radiogroup" aria-label="Liquidity range"><label className={range === "tight" ? "choice selected" : "choice"}><input type="radio" name="range" value="tight" checked={range === "tight"} onChange={() => onRangeChange("tight")} /><span><b>Tight</b><small>More concentration · exits sooner</small></span></label><label className={range === "balanced" ? "choice selected" : "choice"}><input type="radio" name="range" value="balanced" checked={range === "balanced"} onChange={() => onRangeChange("balanced")} /><span><b>Balanced</b><small>Default coverage · moderate movement</small></span></label><label className={range === "wide" ? "choice selected" : "choice"}><input type="radio" name="range" value="wide" checked={range === "wide"} onChange={() => onRangeChange("wide")} /><span><b>Wide</b><small>More coverage · lower concentration</small></span></label></div></div> : null}
    {step === 3 ? <div className="review-step"><h3>Choose an expiry.</h3><p>The review ends when this period expires. A future live mandate would need a fresh decision after that point.</p><label>Review duration<select value={expiry} onChange={(event) => onExpiryChange(event.target.value)}><option value="1">1 day</option><option value="7">7 days</option><option value="14">14 days</option></select></label><div className="review-note"><span>RECOVERY</span><b>Your return address would remain the connected wallet.</b></div></div> : null}
    {step === 4 ? <div className="review-step"><h3>Review the mandate.</h3><p>Read the full boundary before connecting a wallet. Exact token debits and minimum receives stay withheld until a fresh executable quote exists.</p><dl className="mandate-readout"><div><dt>MARKET</dt><dd>{market.pair}</dd></div><div><dt>CAPITAL CAP</dt><dd>${Number(capital || 0).toLocaleString()} USD</dd></div><div><dt>RANGE</dt><dd>{range.toUpperCase()} · TICKS PENDING</dd></div><div><dt>EXPIRY</dt><dd>{expiry} DAYS</dd></div><div><dt>TOKEN DEBITS</dt><dd>WITHHELD · QUOTE INCOMPLETE</dd></div><div><dt>MINIMUM RECEIVES</dt><dd>WITHHELD · QUOTE INCOMPLETE</dd></div><div><dt>FEES / REWARDS</dt><dd>NOT VERIFIED</dd></div><div><dt>AUTHORITY</dt><dd>WALLET CONNECTS NEXT</dd></div></dl><div className="review-note"><span>KNOWN RISK</span><b>Thin stock-side exit depth and incomplete tick coverage can change execution or prevent it.</b></div></div> : null}
    {step === 5 ? <div className="review-step handoff-paused"><div className="paused-mark">!</div><h3>Wallet handoff is paused.</h3><p>Your mandate is ready for a review-only wallet handoff. Preview mode will not request a signature, create transaction bytes, or move funds.</p><div className="handoff-summary"><span>REVIEWED MANDATE</span><strong>{market.pair} · ${Number(capital || 0).toLocaleString()} cap · {range} range · {expiry} days</strong></div>{wallets.length === 0 ? <p className="wallet-empty">No compatible Solana wallet was detected in this browser.</p> : <div className="wallet-connect-list">{wallets.map((candidate) => <button className="wallet-connect-option" disabled={connectingWallet !== null} key={candidate.name} type="button" onClick={() => onConnect(candidate)}><span>{candidate.name}</span><span>{connectingWallet === candidate.name ? "CONNECTING…" : "CONNECT"} ↗</span></button>)}</div>}{connectedWallet ? <div className="wallet-connected"><span>CONNECTED FOR REVIEW · {connectedWallet.walletName}</span><b>{shortAddress(connectedWallet.address)} · {connectedWallet.chain === "solana:mainnet" ? "MAINNET" : "DEVNET"}</b></div> : null}{walletError ? <p className="wallet-error" role="alert">{walletError}</p> : null}<div className="review-note"><span>PREVIEW CAPABILITY</span><b>Underwriting is available. Signing and transaction preparation are disabled.</b></div></div> : null}
    <div className="review-actions"><button className="sheet-secondary" type="button" onClick={step === 1 || step === 5 ? onClose : onBack}>{step === 1 || step === 5 ? "Return to dossier" : "Back"}</button>{step < 5 ? <button className="primary-button" type="button" onClick={onNext}>{step === 4 ? "Review wallet boundary" : "Continue"}<span aria-hidden="true">→</span></button> : null}</div>
  </section></div>;
}

export function MarketFlow({ market, campaign, stockCheck }: MarketFlowProps) {
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
    setWalletError(null);
    setReviewOpen(true);
  }

  function nextStep() {
    if (step === 4) setWallets(discoverSolanaWallets());
    setStep((current) => (current < 5 ? (current + 1) as ReviewStep : current));
  }

  function previousStep() {
    setStep((current) => (current > 1 ? (current - 1) as ReviewStep : current));
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
      <div className="dossier-topline"><Link className="dossier-back" href="/markets">← All markets</Link><span>{"/// MARKET DOSSIER"}</span><span className="dossier-captured">CAPTURED {new Date(market.snapshotAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).toUpperCase()}</span></div>
      <div className="dossier-grid">
        <div className="dossier-main">
          <p className="eyebrow">{market.community}</p>
          <div className="dossier-title-row"><h1 id="dossier-title">{market.pair}</h1><span className="status-chip">{market.riskLabel}</span></div>
          <p className="dossier-lede">A stock-paired market looking for depth. Review the activity field, campaign terms and stock evidence before you decide whether it deserves your capital.</p>
          <div className="dossier-field-wrap"><MarketField stockSymbol={market.stockSymbol} memeSymbol={market.memeSymbol} /></div>
          <div className="dossier-stats"><div><span>TVL / CAPTURED</span><b>{usd(market.tvlUsdMicro)}</b><small>Snapshot value</small></div><div><span>24H VOLUME</span><b>{usd(market.volume24hUsdMicro)}</b><small>Matched window</small></div><div><span>VENUE</span><b>RAYDIUM CLMM</b><small>Program checked</small></div><div><span>IDENTITY</span><b>POOL VERIFIED</b><small>Exact address</small></div></div>
          <StockCheckPanel market={market} stockCheck={stockCheck} />
        </div>
        <aside className="dossier-aside">
          <div className="dossier-aside-head"><span className="eyebrow">DECISION STATUS</span><span className="dossier-dot"><i /> REVIEW REQUIRED</span></div>
          <h2>{campaign ? "A project is seeking liquidity." : "No active campaign."}</h2>
          <p>KOVA brings the market evidence together before you decide. An agent can propose a bounded position, but it cannot override your mandate or hold your funds.</p>
          <div className="dossier-campaign"><div><span>CAMPAIGN TARGET</span><b>{usd(campaign?.targetUsdMicro)}</b></div><div><span>INTEREST SO FAR</span><b>{usd(campaign?.backedUsdMicro)}</b></div><div><span>ANSEM SCOPE</span><b className="boost-value">{ansem(campaign?.rewardBudgetRaw)}</b></div></div>
          <button className="primary-button dossier-cta" type="button" onClick={openReview}>Review backing <span aria-hidden="true">↗</span></button>
          <p className="dossier-disclosure">Captured campaign preview. No user funds are held and no live LP position is created in this build.</p>
          <a className="dossier-pool-link" href={`https://solscan.io/account/${market.pool}`} target="_blank" rel="noreferrer">Inspect pool identity <span aria-hidden="true">↗</span></a>
        </aside>
      </div>
    </section>
    <ReviewSheet market={market} isOpen={isReviewOpen} step={step} capital={capital} range={range} expiry={expiry} wallets={wallets} connectedWallet={connectedWallet} walletError={walletError} connectingWallet={connectingWallet} onClose={() => setReviewOpen(false)} onNext={nextStep} onBack={previousStep} onCapitalChange={setCapital} onRangeChange={setRange} onExpiryChange={setExpiry} onConnect={(wallet) => void connectWallet(wallet)} />
  </>;
}

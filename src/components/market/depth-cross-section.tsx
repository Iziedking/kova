import type { DiscoverMarket } from "@/domain/market-catalog";

/**
 * The focal object: proposed deployed capital against independently measured
 * stock exit capacity. Shared by the landing page, the market dossier and the
 * backing wizard.
 *
 * The geometry is illustrative and is labelled as such wherever it renders.
 * Spec section 14 requires that label; do not remove it.
 *
 * `idPrefix` exists because a page may render this more than once. Duplicate DOM
 * ids would make `aria-labelledby` ambiguous and point every `url(#...)` fill at
 * the first instance's gradients. Each call site on a shared page passes its own.
 */
export function DepthCrossSection({
  market,
  variant = "panel",
  idPrefix = "depth",
}: {
  market: DiscoverMarket;
  variant?: "panel" | "bare";
  idPrefix?: string;
}) {
  const titleId = `${idPrefix}-title`;
  const descId = `${idPrefix}-desc`;
  const bandId = `${idPrefix}-band`;
  const capacityId = `${idPrefix}-capacity`;
  const gridId = `${idPrefix}-grid`;

  const svg = (
    <svg viewBox="0 0 760 330" role="img" aria-labelledby={`${titleId} ${descId}`}>
      <title id={titleId}>Proposed capital against measured exit capacity</title>
      <desc id={descId}>
        The cyan band shows a proposed position. The indigo curve shows independently measured stock exit
        capacity. It is not a guarantee of execution.
      </desc>
      <defs>
        <linearGradient id={bandId} x1="0" x2="1">
          <stop offset="0" stopColor="#5BC8E0" stopOpacity=".08" />
          <stop offset=".7" stopColor="#5BC8E0" stopOpacity=".74" />
          <stop offset="1" stopColor="#5BC8E0" stopOpacity=".18" />
        </linearGradient>
        <linearGradient id={capacityId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#8E92EC" stopOpacity=".32" />
          <stop offset="1" stopColor="#8E92EC" stopOpacity="0" />
        </linearGradient>
        <pattern id={gridId} width="76" height="55" patternUnits="userSpaceOnUse">
          <path d="M76 0H0V55" fill="none" stroke="#fff" strokeOpacity=".07" />
        </pattern>
      </defs>
      <rect width="760" height="330" fill={`url(#${gridId})`} />
      <line x1="32" y1="254" x2="728" y2="254" stroke="#fff" strokeOpacity=".15" />
      <line x1="32" y1="166" x2="728" y2="166" stroke="#fff" strokeOpacity=".08" strokeDasharray="3 8" />
      <path
        d="M32 246C102 232 138 244 196 212s77-20 123-56 60 19 111-11 72-66 112-45 58-6 85-49 68-42 101-47V254H32Z"
        fill={`url(#${capacityId})`}
      />
      <path
        className="depth-capacity-line"
        d="M32 246C102 232 138 244 196 212s77-20 123-56 60 19 111-11 72-66 112-45 58-6 85-49 68-42 101-47"
        fill="none"
        stroke="#8E92EC"
        strokeWidth="2"
      />
      <path className="depth-proposed-band" d="M32 225H392V242H32Z" fill={`url(#${bandId})`} />
      <line x1="392" y1="206" x2="392" y2="262" stroke="#5BC8E0" strokeWidth="1" strokeDasharray="4 4" />
      <circle className="depth-node" cx="645" cy="102" r="5" fill="#8E92EC" />
      <text x="32" y="294" className="depth-axis-label">LOWER EXIT CAPACITY</text>
      <text x="608" y="294" className="depth-axis-label">HIGHER EXIT CAPACITY</text>
      <text x="42" y="217" className="depth-band-label">PROPOSED POSITION</text>
      <text x="548" y="88" className="depth-curve-label">MEASURED STOCK EXIT DEPTH</text>
      <text x="405" y="202" className="depth-value-label">CAPACITY CHECK</text>
    </svg>
  );

  if (variant === "bare") return <div className="depth-object">{svg}</div>;

  return (
    <div className="depth-object" aria-label="Illustrative liquidity depth cross-section">
      <div className="depth-object-header">
        <span>KOVA / DEPTH CROSS-SECTION</span>
        <span className="object-note">ILLUSTRATIVE · CAPTURED {market.snapshotAt.slice(0, 10)}</span>
      </div>
      {svg}
      <div className="depth-object-footer">
        <span>
          <i className="legend-mark legend-band" /> proposed deployed capital
        </span>
        <span>
          <i className="legend-mark legend-curve" /> measured exit capacity
        </span>
        <span>NOT A GUARANTEE</span>
      </div>
    </div>
  );
}

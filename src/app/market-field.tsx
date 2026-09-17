interface MarketFieldProps {
  stockSymbol?: string;
  memeSymbol?: string;
}

export function MarketField({ stockSymbol = "NVDAx", memeSymbol = "NVDGE" }: MarketFieldProps) {
  return <div className="market-field" aria-label="Illustrative market activity field">
    <div className="field-header"><span>FLOAT / MARKET FIELD</span><span className="field-status"><i /> SNAPSHOT MODE</span></div>
    <svg className="field-chart" viewBox="0 0 720 310" role="img" aria-label="Illustrative liquidity and activity chart">
      <defs>
        <linearGradient id="field-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5BC8E0" stopOpacity=".2" /><stop offset="1" stopColor="#5BC8E0" stopOpacity="0" /></linearGradient>
        <pattern id="field-grid" width="72" height="62" patternUnits="userSpaceOnUse"><path d="M72 0H0V62" fill="none" stroke="#fff" strokeOpacity=".055" strokeWidth="1" /></pattern>
      </defs>
      <rect width="720" height="310" fill="url(#field-grid)" />
      <path className="field-area" d="M0 252C68 228 80 246 139 210s67-17 111-42 62 31 100-10 68-54 112-31 55-2 83-38 85-44 175-73V310H0Z" fill="url(#field-fill)" />
      <path className="field-line field-line-main" d="M0 252C68 228 80 246 139 210s67-17 111-42 62 31 100-10 68-54 112-31 55-2 83-38 85-44 175-73" fill="none" stroke="#5BC8E0" strokeWidth="3" />
      <path className="field-line field-line-ghost" d="M0 270C69 255 96 270 142 245s77 8 113-13 64 25 103-1 55-41 101-22 64 4 93-21 81-34 168-44" fill="none" stroke="#8E92EC" strokeOpacity=".42" strokeWidth="1.5" strokeDasharray="6 8" />
      <g className="field-candles" fill="none" stroke="#8E92EC" strokeWidth="2">
        <path d="M88 205v-46M88 174h24v22H88z" /><path d="M174 210v-77M174 158h24v35h-24z" /><path d="M264 180v-62M264 139h24v29h-24z" /><path d="M358 166v-91M358 112h24v38h-24z" /><path d="M456 129V53M456 75h24v42h-24z" /><path d="M556 102V28M556 46h24v40h-24z" />
      </g>
      <circle className="field-dot" cx="558" cy="78" r="5" fill="#8E92EC" />
    </svg>
    <div className="field-footer"><span><b>{stockSymbol}</b> / {memeSymbol}</span><span>LIQUIDITY REVIEW <b>02</b></span><span>RAYDIUM CLMM</span></div>
  </div>;
}

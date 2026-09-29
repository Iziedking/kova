"use client";

import { useEffect, useRef, useState } from "react";
import { useResource } from "@/hooks/use-resource";
import { MiniPriceChart } from "./mini-price-chart";

/** Fetch real hourly closes only when this preview is on screen. Fixture series need no request. */
export function MarketSparkline({ mint, points, width = 84, height = 32, fill }: { mint: string; points?: readonly number[] | null; width?: number; height?: number; fill?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const { state } = useResource((s, ctx) => s.markets.candles(mint, "1h", ctx), [mint], { enabled: visible && !points, refreshMs: 120_000 });
  const series = points ?? (state.status === "ready" ? state.data.slice(-24).map((candle) => candle.close) : null);
  const label = state.status === "loading" ? "Loading price trend" : state.status === "error" || state.status === "pending" ? "Price trend unavailable" : "No price history yet";
  return <span ref={ref} className="inline-flex shrink-0 items-center justify-center" style={{ width, height }}>
    {series && series.length >= 2 ? <MiniPriceChart points={series} width={width} height={height} fill={fill} /> : <span role="img" aria-label={label} title={label} className="text-[11px] text-text-muted">—</span>}
  </span>;
}

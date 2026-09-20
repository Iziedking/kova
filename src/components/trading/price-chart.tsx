"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatCompact, formatUsdPrice } from "@/lib/format";
import type { Candle, Timeframe } from "@/types/market";

export interface TradeMarker {
  time: number;
  side: "buy" | "sell";
  priceUsd: number;
}

const AXIS_W = 58;
const AXIS_H = 24;
const PAD_TOP = 10;

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min || 1;
  const rough = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= rough) ?? rough;
  const ticks: number[] = [];
  for (let tick = Math.ceil(min / step) * step; tick <= max; tick += step) ticks.push(tick);
  return ticks;
}

function formatTick(value: number): string {
  if (Math.abs(value) >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return formatUsdPrice(value).replace("$", "");
}

function formatTime(seconds: number, timeframe: Timeframe): string {
  const date = new Date(seconds * 1000);
  if (timeframe === "1d" || timeframe === "1w") return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * A candlestick + volume chart in SVG. It draws only the candles it is given -
 * no interpolation, no synthetic bars - and marks the viewer's own confirmed
 * buys and sells and average entry. Competition time is separate from the
 * timeframe (blueprint 17): this chart never shows the match clock.
 */
export function PriceChart({
  candles,
  timeframe,
  symbol,
  height = 380,
  markers = [],
  averageEntryUsd,
  className,
}: {
  candles: readonly Candle[];
  timeframe: Timeframe;
  symbol: string;
  height?: number;
  markers?: readonly TradeMarker[];
  averageEntryUsd?: number | null;
  className?: string;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const plotW = Math.max(0, width - AXIS_W);
  const plotH = height - AXIS_H - PAD_TOP;
  const volH = plotH * 0.18;
  const priceH = plotH - volH - 8;

  let body: React.ReactNode = null;
  if (candles.length > 0 && width > 0) {
    const lows = candles.map((c) => c.low);
    const highs = candles.map((c) => c.high);
    let min = Math.min(...lows);
    let max = Math.max(...highs);
    // Only stretch the axis for the average-entry line when it is near the visible range;
    // a far-off entry would flatten the candles, so it is left off-chart instead.
    const spanNow = max - min || max * 0.02;
    const showEntry = averageEntryUsd != null && averageEntryUsd >= min - spanNow * 0.35 && averageEntryUsd <= max + spanNow * 0.35;
    if (showEntry && averageEntryUsd) {
      min = Math.min(min, averageEntryUsd);
      max = Math.max(max, averageEntryUsd);
    }
    const pad = (max - min || max * 0.02) * 0.08;
    min -= pad;
    max += pad;
    const y = (price: number) => PAD_TOP + (1 - (price - min) / (max - min)) * priceH;
    const slot = plotW / candles.length;
    const x = (index: number) => index * slot + slot / 2;
    const maxVol = Math.max(...candles.map((c) => c.volume), 1);
    const last = candles[candles.length - 1];
    const lastUp = last.close >= last.open;
    const tone = lastUp ? "var(--color-success)" : "var(--color-danger)";
    const yTicks = niceTicks(min, max, 6);
    const xEvery = Math.max(1, Math.round(candles.length / Math.max(3, Math.floor(plotW / 110))));

    const markerIndex = (time: number) => {
      let best = 0;
      let bestDelta = Infinity;
      candles.forEach((candle, index) => {
        const delta = Math.abs(candle.time - time);
        if (delta < bestDelta) {
          bestDelta = delta;
          best = index;
        }
      });
      return best;
    };

    const active = hover === null ? null : candles[hover];

    body = (
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${symbol} ${timeframe} price chart. Last price ${formatUsdPrice(last.close)}.`}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const index = Math.floor((event.clientX - rect.left) / slot);
          setHover(index >= 0 && index < candles.length ? index : null);
        }}
        onPointerLeave={() => setHover(null)}
        className="touch-none select-none"
      >
        {/* grid + price axis */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={0} x2={plotW} y1={y(tick)} y2={y(tick)} stroke="var(--color-border-subtle)" strokeWidth="1" opacity="0.7" />
            <text x={plotW + 8} y={y(tick) + 4} fill="var(--color-text-secondary)" fontSize="11" className="num">
              {formatTick(tick)}
            </text>
          </g>
        ))}

        {/* time axis */}
        {candles.map((candle, index) =>
          index % xEvery === 0 && index > 0 && index < candles.length - 1 ? (
            <text key={candle.time} x={x(index)} y={height - 6} textAnchor="middle" fill="var(--color-text-secondary)" fontSize="11" className="num">
              {formatTime(candle.time, timeframe)}
            </text>
          ) : null,
        )}

        {/* volume */}
        {candles.map((candle, index) => (
          <rect
            key={`v-${candle.time}`}
            x={x(index) - Math.max(1, slot * 0.31)}
            width={Math.max(1, slot * 0.62)}
            y={PAD_TOP + priceH + 8 + volH * (1 - candle.volume / maxVol)}
            height={Math.max(1, volH * (candle.volume / maxVol))}
            fill={candle.close >= candle.open ? "var(--color-success)" : "var(--color-danger)"}
            opacity="0.3"
          />
        ))}

        {/* average entry */}
        {showEntry && averageEntryUsd ? (
          <g>
            <line x1={0} x2={plotW} y1={y(averageEntryUsd)} y2={y(averageEntryUsd)} stroke="var(--color-accent)" strokeDasharray="5 4" strokeWidth="1" opacity="0.9" />
            <text x={6} y={y(averageEntryUsd) - 5} fill="var(--color-accent)" fontSize="11">
              Avg entry {formatUsdPrice(averageEntryUsd)}
            </text>
          </g>
        ) : null}

        {/* candles */}
        {candles.map((candle, index) => {
          const up = candle.close >= candle.open;
          const color = up ? "var(--color-success)" : "var(--color-danger)";
          const top = y(Math.max(candle.open, candle.close));
          const bottom = y(Math.min(candle.open, candle.close));
          return (
            <g key={candle.time}>
              <line x1={x(index)} x2={x(index)} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth="1" />
              <rect x={x(index) - Math.max(1, slot * 0.31)} width={Math.max(1.5, slot * 0.62)} y={top} height={Math.max(1, bottom - top)} fill={color} />
            </g>
          );
        })}

        {/* the viewer's own confirmed trades */}
        {markers.filter((marker) => marker.priceUsd >= min && marker.priceUsd <= max).map((marker, index) => {
          const i = markerIndex(marker.time);
          const cx = x(i);
          const cy = y(marker.priceUsd);
          const buy = marker.side === "buy";
          return (
            <path
              key={`${marker.time}-${index}`}
              d={buy ? `M${cx} ${cy + 3} l-6 10 h12 z` : `M${cx} ${cy - 3} l-6 -10 h12 z`}
              fill={buy ? "var(--color-success)" : "var(--color-danger)"}
              stroke="var(--color-bg)"
              strokeWidth="1.5"
            >
              <title>{`${buy ? "Buy" : "Sell"} at ${formatUsdPrice(marker.priceUsd)}`}</title>
            </path>
          );
        })}

        {/* last price */}
        <line x1={0} x2={plotW} y1={y(last.close)} y2={y(last.close)} stroke={tone} strokeDasharray="3 3" strokeWidth="1" opacity="0.7" />
        <rect x={plotW + 2} y={y(last.close) - 10} width={AXIS_W - 4} height={20} rx="4" fill={tone} />
        <text x={plotW + AXIS_W / 2} y={y(last.close) + 4} textAnchor="middle" fill="#04140d" fontSize="11" fontWeight="600" className="num">
          {formatTick(last.close)}
        </text>

        {/* crosshair */}
        {active && hover !== null ? (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={PAD_TOP} y2={PAD_TOP + plotH} stroke="var(--color-text-muted)" strokeDasharray="2 3" />
            <text x={8} y={16} fill="var(--color-text-secondary)" fontSize="11" className="num">
              {formatTime(active.time, timeframe)} · O {formatTick(active.open)} H {formatTick(active.high)} L {formatTick(active.low)} C {formatTick(active.close)} · V {formatCompact(active.volume)}
            </text>
          </g>
        ) : null}
      </svg>
    );
  }

  return (
    <div ref={ref} className={cn("relative w-full", className)} style={{ height }}>
      {body}
    </div>
  );
}

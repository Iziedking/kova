"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/format";

const AXIS_W = 52;
const AXIS_H = 22;

/**
 * An area chart over real portfolio value points. Renders nothing for fewer than
 * two points - a missing series is visibly missing, never a decorative line.
 */
export function PortfolioChart({
  points,
  height = 190,
  hidden,
  className,
}: {
  points: ReadonlyArray<{ time: number; valueUsd: number }> | null;
  height?: number;
  /** Privacy toggle: blur the chart and its scale. */
  hidden?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const gradient = useId();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  if (!points || points.length < 2) {
    return <div ref={ref} className={cn("grid place-items-center text-[13px] text-text-muted", className)} style={{ height }}>No value history yet.</div>;
  }

  const plotW = Math.max(0, width - AXIS_W);
  const plotH = height - AXIS_H;
  const values = points.map((p) => p.valueUsd);
  let min = Math.min(...values);
  let max = Math.max(...values);
  const pad = (max - min || max * 0.02) * 0.12;
  min -= pad;
  max += pad;
  const x = (index: number) => (index / (points.length - 1)) * plotW;
  const y = (value: number) => 6 + (1 - (value - min) / (max - min)) * (plotH - 10);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.valueUsd).toFixed(1)}`).join(" ");
  const area = `${line} L${plotW} ${plotH} L0 ${plotH} Z`;
  const up = values[values.length - 1] >= values[0];
  const color = up ? "var(--color-success)" : "var(--color-danger)";
  const ticks = [0, 1, 2, 3].map((i) => min + ((max - min) * i) / 3);
  const labelEvery = Math.floor(points.length / 4);

  return (
    <div ref={ref} className={cn("relative w-full", className)} style={{ height }}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label="Portfolio value over time" className={cn(hidden && "blur-md")}>
          <defs>
            <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.28" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={0} x2={plotW} y1={y(tick)} y2={y(tick)} stroke="var(--color-border-subtle)" opacity="0.6" />
              <text x={plotW + 8} y={y(tick) + 4} fill="var(--color-text-secondary)" fontSize="11" className="num">
                {formatUsd(tick, { compact: true })}
              </text>
            </g>
          ))}
          <path d={area} fill={`url(#${gradient})`} />
          <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
          {points.map((point, index) =>
            labelEvery > 0 && index % labelEvery === 0 && index > 0 && index < points.length - 1 ? (
              <text key={point.time} x={x(index)} y={height - 5} textAnchor="middle" fill="var(--color-text-secondary)" fontSize="11" className="num">
                {new Date(point.time * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </text>
            ) : null,
          )}
        </svg>
      ) : null}
    </div>
  );
}

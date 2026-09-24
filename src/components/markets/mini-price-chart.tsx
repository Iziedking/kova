import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * A sparkline over real close prices. It never invents a shape: with fewer than
 * two points it renders nothing, so a missing series is visibly missing.
 */
export function MiniPriceChart({
  points,
  direction,
  width = 84,
  height = 32,
  fill,
  className,
}: {
  points: readonly number[] | null | undefined;
  /** Colours the line; defaults to the series' own start-to-end direction. */
  direction?: "up" | "down" | "flat";
  width?: number;
  height?: number;
  fill?: boolean;
  className?: string;
}) {
  const gradientId = useId();
  if (!points || points.length < 2) {
    return <span aria-hidden="true" className={cn("inline-block", className)} style={{ width, height }} />;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const pad = 2;
  const stepX = (width - pad * 2) / (points.length - 1);
  const coords = points.map((value, index) => [pad + index * stepX, pad + (1 - (value - min) / span) * (height - pad * 2)] as const);
  const line = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)} ${height} L${coords[0][0].toFixed(1)} ${height} Z`;

  const resolved = direction ?? (points[points.length - 1] > points[0] ? "up" : points[points.length - 1] < points[0] ? "down" : "flat");
  const color = resolved === "up" ? "var(--color-success)" : resolved === "down" ? "var(--color-danger)" : "var(--color-text-secondary)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Price trend ${resolved}`}
      className={cn("shrink-0 overflow-visible", className)}
    >
      {fill ? (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.28" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
        </>
      ) : null}
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

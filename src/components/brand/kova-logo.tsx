import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * The Kova mark: a four-point star (the chip's centre) in the brand violet.
 * Drawn as SVG so it stays crisp at 20-40px and inherits no raster artefacts.
 */
export function KovaMark({ size = 32, className }: { size?: number; className?: string }) {
  // Unique per instance: a shared id would resolve to a hidden copy and drop the fill.
  const gradient = `kova-mark-${useId().replace(/:/g, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id={gradient} x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#C9B0FF" />
          <stop offset="0.55" stopColor="#9B6CFF" />
          <stop offset="1" stopColor="#7A45F0" />
        </linearGradient>
      </defs>
      <path
        d="M24 3.5c1.1 8.9 4.2 14.4 9.3 17.6 3.1 1.9 6.9 3 11.2 3.4-4.3.4-8.1 1.5-11.2 3.4-5.1 3.2-8.2 8.7-9.3 17.6-1.1-8.9-4.2-14.4-9.3-17.6-3.1-1.9-6.9-3-11.2-3.4 4.3-.4 8.1-1.5 11.2-3.4C19.8 17.9 22.9 12.4 24 3.5Z"
        fill={`url(#${gradient})`}
      />
      <path
        d="M24 3.5c1.1 8.9 4.2 14.4 9.3 17.6 3.1 1.9 6.9 3 11.2 3.4-4.3.4-8.1 1.5-11.2 3.4-5.1 3.2-8.2 8.7-9.3 17.6-1.1-8.9-4.2-14.4-9.3-17.6-3.1-1.9-6.9-3-11.2-3.4 4.3-.4 8.1-1.5 11.2-3.4C19.8 17.9 22.9 12.4 24 3.5Z"
        stroke="#E4D7FF"
        strokeOpacity="0.35"
        strokeWidth="1"
      />
    </svg>
  );
}

export function KovaWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display text-[26px] font-bold leading-none tracking-[-0.03em] text-text-primary", className)}>
      Kova
    </span>
  );
}

/** Mark + wordmark lockup for headers and auth. */
export function KovaLockup({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const mark = size === "lg" ? 40 : size === "sm" ? 26 : 32;
  const word = size === "lg" ? "text-[34px]" : size === "sm" ? "text-[22px]" : "text-[26px]";
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <KovaMark size={mark} />
      <KovaWordmark className={word} />
    </span>
  );
}

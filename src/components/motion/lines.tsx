import type { CSSProperties } from "react";

/**
 * Masked per-line reveal. Each line rides up out of its own static overflow box,
 * staggered by `--i`. Transform only; the mask is `overflow:hidden`, not animated.
 */
export function Lines({ lines, from = 0 }: { lines: readonly string[]; from?: number }) {
  return (
    <span className="kova-lines">
      {lines.map((line, i) => (
        <span key={line} className="kova-line" style={{ "--i": from + i } as CSSProperties}>
          <span>{line}</span>
        </span>
      ))}
    </span>
  );
}

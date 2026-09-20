/**
 * Display formatting only. Nothing here is authoritative: execution prices,
 * PnL and settlement come from the backend, never from these helpers.
 */

/** ANSEM is a 6-decimal token; raw amounts arrive as base-unit strings. */
export const ANSEM_DECIMALS = 6;

const EM_DASH = "—";

export function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Adaptive precision so `$0.000012` and `$875.21` both read correctly. */
export function formatUsdPrice(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return EM_DASH;
  const abs = Math.abs(value);
  let digits = 2;
  if (abs === 0) digits = 2;
  else if (abs < 0.0001) digits = 8;
  else if (abs < 0.01) digits = 6;
  else if (abs < 1) digits = 4;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function formatCompact(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return EM_DASH;
  const abs = Math.abs(value);
  const units: Array<[number, string]> = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, suffix] of units) {
    if (abs >= size) return `${(value / size).toFixed(abs / size >= 100 ? 0 : 1).replace(/\.0$/, "")}${suffix}`;
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function formatUsd(value: number | null | undefined, options: { compact?: boolean; cents?: boolean } = {}): string {
  if (!isFiniteNumber(value)) return EM_DASH;
  if (options.compact) return `${value < 0 ? "-" : ""}$${formatCompact(Math.abs(value))}`;
  const cents = options.cents ?? Math.abs(value) < 10000;
  return `${value < 0 ? "-" : ""}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  })}`;
}

export function formatSignedUsd(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return EM_DASH;
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatUsd(Math.abs(value), { cents: true })}`;
}

/** Always carries a sign for non-zero values: direction is never colour-only. */
export function formatPct(value: number | null | undefined, options: { digits?: number; signed?: boolean } = {}): string {
  if (!isFiniteNumber(value)) return EM_DASH;
  const digits = options.digits ?? 1;
  const signed = options.signed ?? true;
  const fixed = Math.abs(value).toFixed(digits);
  const isZero = Number(fixed) === 0;
  const sign = isZero ? "" : value < 0 ? "-" : signed ? "+" : "";
  return `${sign}${fixed}%`;
}

export type Direction = "up" | "down" | "flat" | "none";

export function directionOf(value: number | null | undefined): Direction {
  if (!isFiniteNumber(value)) return "none";
  if (Math.abs(value) < 0.05) return "flat";
  return value > 0 ? "up" : "down";
}

export const DIRECTION_TEXT: Record<Direction, string> = {
  up: "text-success",
  down: "text-danger",
  flat: "text-text-secondary",
  none: "text-text-muted",
};

/** Converts a raw base-unit string to an ANSEM label, e.g. `500 ANSEM`. */
export function formatAnsemRaw(raw: string | null | undefined, options: { unit?: boolean } = {}): string {
  if (!raw || !/^(0|[1-9][0-9]*)$/.test(raw)) return EM_DASH;
  const value = BigInt(raw);
  const scale = 10n ** BigInt(ANSEM_DECIMALS);
  const whole = value / scale;
  const fraction = value % scale;
  let text = whole.toLocaleString("en-US");
  if (fraction !== 0n) {
    const decimals = fraction.toString().padStart(ANSEM_DECIMALS, "0").replace(/0+$/, "");
    text = `${text}.${decimals}`;
  }
  return options.unit === false ? text : `${text} ANSEM`;
}

export function formatAnsem(amount: number | null | undefined, options: { unit?: boolean } = {}): string {
  if (!isFiniteNumber(amount)) return EM_DASH;
  const text = amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return options.unit === false ? text : `${text} ANSEM`;
}

/** `12m 14s`, `1h 12m`, `2d 4h`. Used for remaining and total durations. */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (!isFiniteNumber(totalSeconds)) return EM_DASH;
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

/** Short label for a configured match length: `5m`, `15m`, `1h`, `24h`. */
export function formatDurationShort(totalSeconds: number): string {
  if (totalSeconds % 3600 === 0) return `${totalSeconds / 3600}h`;
  if (totalSeconds % 60 === 0) return `${totalSeconds / 60}m`;
  return `${totalSeconds}s`;
}

/** `08:42` countdown, or `1:02:09` past an hour. */
export function formatClock(totalSeconds: number | null | undefined): string {
  if (!isFiniteNumber(totalSeconds)) return "--:--";
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pair = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pair(m)}:${pair(s)}` : `${pair(m)}:${pair(s)}`;
}

export function formatTimeAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return EM_DASH;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return EM_DASH;
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Age of a token since launch: `3h`, `2d`, `5w`. */
export function formatAge(seconds: number | null | undefined): string {
  if (!isFiniteNumber(seconds)) return EM_DASH;
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  if (seconds < 86400 * 14) return `${Math.round(seconds / 86400)}d`;
  return `${Math.round(seconds / (86400 * 7))}w`;
}

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

export function initialsOf(name: string): string {
  const cleaned = name.replace(/^@/, "").trim();
  return (cleaned.slice(0, 2) || "?").toUpperCase();
}

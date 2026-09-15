/** Deterministic evidence identity and freshness helpers. Node crypto reviewed 2026-09-15. */
import { createHash } from "node:crypto";

export type EvidenceKind = "market_candidate" | "feasibility_report" | "stock_check" | "campaign_preview";
export type SnapshotFreshness = "fresh" | "stale" | "unknown";

export interface EvidenceSnapshot<T = unknown> {
  id: string;
  kind: EvidenceKind;
  subjectId: string;
  reportHash: string;
  source: string;
  slot: number | null;
  observedAt: string;
  expiresAt: string | null;
  payload: T;
}

export interface ReadEvidenceSnapshot<T = unknown> extends EvidenceSnapshot<T> {
  freshness: SnapshotFreshness;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonicalize(entry)]));
  }
  return value;
}

export function hashEvidence(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

export function snapshotId(kind: EvidenceKind, subjectId: string, reportHash: string): string {
  return `${kind}:${subjectId}:${reportHash}`;
}

export function freshnessFor(expiresAt: string | null, now = new Date()): SnapshotFreshness {
  if (expiresAt === null) return "unknown";
  const expires = Date.parse(expiresAt);
  if (!Number.isFinite(expires)) return "unknown";
  return now.getTime() < expires ? "fresh" : "stale";
}

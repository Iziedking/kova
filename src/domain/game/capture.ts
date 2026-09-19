import { createHash } from "node:crypto";
import { z } from "zod";
import { Price18Schema, SolanaAddressSchema } from "./api-contracts";

export const CapturePlanSchema = z.object({
  schemaVersion: z.literal("kova-capture-v1"),
  tableId: z.uuid(),
  mode: z.literal("observed_mark_preview"),
  provider: z.string().min(1),
  providerVersion: z.string().min(1),
  startTargetAt: z.iso.datetime(),
  endTargetAt: z.iso.datetime(),
  maxStartDelayMs: z.number().int().min(0).max(5_000),
  responseDeadlineMs: z.number().int().min(1).max(10_000),
  maxCrossPairSkewMs: z.number().int().min(0).max(5_000),
  fallbackDelayMs: z.number().int().min(1).max(10_000).nullable(),
  pairBindings: z.array(z.object({ wallet: SolanaAddressSchema, mint: SolanaAddressSchema, pairAddress: SolanaAddressSchema })).min(2).max(6),
}).strict();

export const PriceSampleSchema = z.object({
  schemaVersion: z.literal("kova-price-sample-v1"),
  tableId: z.uuid(),
  phase: z.enum(["start", "end"]),
  pairAddress: SolanaAddressSchema,
  targetAt: z.iso.datetime(),
  requestStartedAt: z.iso.datetime(),
  requestFinishedAt: z.iso.datetime(),
  providerObservedAt: z.iso.datetime().nullable(),
  providerSlot: z.number().int().nonnegative().nullable(),
  capturedAt: z.iso.datetime(),
  price18: Price18Schema,
  liquidityUsdMicro: z.string().regex(/^(0|[1-9][0-9]*)$/).nullable(),
  rawResponseHash: z.string().regex(/^[0-9a-f]{64}$/),
  source: z.string().min(1),
  attempt: z.number().int().min(1).max(2),
  policyHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export type CapturePlan = z.infer<typeof CapturePlanSchema>;
export type PriceSample = z.infer<typeof PriceSampleSchema>;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function capturePolicyHash(plan: CapturePlan): string {
  return createHash("sha256").update(canonical(plan)).digest("hex");
}

export function validatePriceSample(sample: PriceSample, plan: CapturePlan): { ok: true } | { ok: false; code: string } {
  if (sample.tableId !== plan.tableId || sample.policyHash !== capturePolicyHash(plan)) return { ok: false, code: "CAPTURE_POLICY_MISMATCH" };
  const binding = plan.pairBindings.some((pair) => pair.pairAddress === sample.pairAddress);
  if (!binding) return { ok: false, code: "CAPTURE_PAIR_MISMATCH" };
  const target = Date.parse(sample.targetAt);
  const expected = Date.parse(sample.phase === "start" ? plan.startTargetAt : plan.endTargetAt);
  const started = Date.parse(sample.requestStartedAt);
  const finished = Date.parse(sample.requestFinishedAt);
  const captured = Date.parse(sample.capturedAt);
  if (![target, expected, started, finished, captured].every(Number.isFinite) || target !== expected) return { ok: false, code: "CAPTURE_TIME_INVALID" };
  const allowedStart = sample.attempt === 1 ? expected + plan.maxStartDelayMs : expected + plan.maxStartDelayMs + (plan.fallbackDelayMs ?? 0);
  if (started < expected || started > allowedStart || finished < started || finished - started > plan.responseDeadlineMs || captured < finished) return { ok: false, code: "CAPTURE_WINDOW_MISSED" };
  if (sample.attempt === 2 && plan.fallbackDelayMs === null) return { ok: false, code: "CAPTURE_FALLBACK_DISALLOWED" };
  return { ok: true };
}

export function validateCaptureSet(samples: readonly PriceSample[], plan: CapturePlan, phase: "start" | "end"): { ok: true } | { ok: false; code: string } {
  const requiredPairs = new Set(plan.pairBindings.map((binding) => binding.pairAddress));
  const relevant = samples.filter((sample) => sample.phase === phase);
  if (relevant.length !== requiredPairs.size || new Set(relevant.map((sample) => sample.pairAddress)).size !== requiredPairs.size) return { ok: false, code: "CAPTURE_SET_INCOMPLETE" };
  for (const sample of relevant) if (!validatePriceSample(sample, plan).ok) return { ok: false, code: "CAPTURE_SAMPLE_INVALID" };
  const times = relevant.map((sample) => Date.parse(sample.capturedAt));
  if (Math.max(...times) - Math.min(...times) > plan.maxCrossPairSkewMs) return { ok: false, code: "CAPTURE_SKEW_EXCEEDED" };
  return { ok: true };
}


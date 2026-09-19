import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@solana/web3.js";
import { validateResultManifest } from "../../src/backend/signer/manifest-validator";
import { capturePolicyHash, validateCaptureSet, validatePriceSample, type CapturePlan, type PriceSample } from "../../src/domain/game/capture";
import { createPickCommitment, createSealedMarketHash } from "../../src/domain/game/commitment";

const tableId = "018f7f5e-7b1a-4d40-8a41-8dd5f8108f02";
const walletA = Keypair.generate().publicKey.toBase58();
const walletB = Keypair.generate().publicKey.toBase58();
const mintA = Keypair.generate().publicKey.toBase58();
const mintB = Keypair.generate().publicKey.toBase58();
const pairMint = Keypair.generate().publicKey.toBase58();
const pairA = Keypair.generate().publicKey.toBase58();
const pairB = Keypair.generate().publicKey.toBase58();
const rulesHash = "f".repeat(64);

const plan: CapturePlan = {
  schemaVersion: "kova-capture-v1", tableId, mode: "observed_mark_preview", provider: "fixture", providerVersion: "1",
  startTargetAt: "2026-09-19T18:00:00.000Z", endTargetAt: "2026-09-19T18:15:00.000Z",
  maxStartDelayMs: 1_000, responseDeadlineMs: 5_000, maxCrossPairSkewMs: 2_000, fallbackDelayMs: 2_000,
  pairBindings: [{ wallet: walletA, mint: mintA, pairAddress: pairA }, { wallet: walletB, mint: mintB, pairAddress: pairB }],
};
const policyHash = capturePolicyHash(plan);

function sample(input: { phase: "start" | "end"; pairAddress: string; price18: string; offsetMs?: number; attempt?: number }): PriceSample {
  const target = Date.parse(input.phase === "start" ? plan.startTargetAt : plan.endTargetAt);
  const offset = input.offsetMs ?? 100;
  return {
    schemaVersion: "kova-price-sample-v1", tableId, phase: input.phase, pairAddress: input.pairAddress,
    targetAt: new Date(target).toISOString(), requestStartedAt: new Date(target + offset).toISOString(),
    requestFinishedAt: new Date(target + offset + 100).toISOString(), providerObservedAt: null, providerSlot: null,
    capturedAt: new Date(target + offset + 110).toISOString(), price18: input.price18, liquidityUsdMicro: null,
    rawResponseHash: "a".repeat(64), source: "fixture", attempt: input.attempt ?? 1, policyHash,
  };
}

test("capture policy accepts one fixed sample per pair inside timing and skew bounds", () => {
  const samples = [sample({ phase: "start", pairAddress: pairA, price18: "100" }), sample({ phase: "start", pairAddress: pairB, price18: "200", offsetMs: 500 })];
  assert.deepEqual(validateCaptureSet(samples, plan, "start"), { ok: true });
});

test("capture policy rejects late and unconfigured fallback samples", () => {
  assert.equal(validatePriceSample(sample({ phase: "start", pairAddress: pairA, price18: "100", offsetMs: 1_500 }), plan).ok, false);
  const noFallback = { ...plan, fallbackDelayMs: null };
  const second = { ...sample({ phase: "start", pairAddress: pairA, price18: "100", attempt: 2 }), policyHash: capturePolicyHash(noFallback) };
  assert.deepEqual(validatePriceSample(second, noFallback), { ok: false, code: "CAPTURE_FALLBACK_DISALLOWED" });
});

test("capture set rejects cross-pair timing skew", () => {
  const skewed = { ...plan, maxStartDelayMs: 5_000 };
  const samples = [sample({ phase: "start", pairAddress: pairA, price18: "100" }), { ...sample({ phase: "start", pairAddress: pairB, price18: "200", offsetMs: 3_500 }), policyHash: capturePolicyHash(skewed) }];
  samples[0] = { ...samples[0]!, policyHash: capturePolicyHash(skewed) };
  assert.deepEqual(validateCaptureSet(samples, skewed, "start"), { ok: false, code: "CAPTURE_SKEW_EXCEEDED" });
});

test("signer validator recomputes commitments, scores and entitlements", async () => {
  const saltA = "0".repeat(64);
  const saltB = "1".repeat(64);
  const startA = sample({ phase: "start", pairAddress: pairA, price18: "100" });
  const endA = sample({ phase: "end", pairAddress: pairA, price18: "120" });
  const startB = sample({ phase: "start", pairAddress: pairB, price18: "100" });
  const endB = sample({ phase: "end", pairAddress: pairB, price18: "110" });
  const manifest = {
    schemaVersion: "kova-result-v1", tableId, genesisHash: "g".repeat(32), programId: Keypair.generate().publicKey.toBase58(), rulesHash, rosterHash: "e".repeat(64),
    startTargetAt: plan.startTargetAt, endTargetAt: plan.endTargetAt, potRaw: "100", createdAt: "2026-09-19T18:15:01.000Z",
    entries: [
      { wallet: walletA, mint: mintA, pairMint, saltHex: saltA, commitment: await createPickCommitment({ tableId, wallet: walletA, mint: mintA, saltHex: saltA }), sealedMarketHash: await createSealedMarketHash({ tableId, wallet: walletA, mint: mintA, pairMint, saltHex: saltA, rulesHashHex: rulesHash }), start: startA, end: endA, scoreBps: "2000", entitlementRaw: "100" },
      { wallet: walletB, mint: mintB, pairMint, saltHex: saltB, commitment: await createPickCommitment({ tableId, wallet: walletB, mint: mintB, saltHex: saltB }), sealedMarketHash: await createSealedMarketHash({ tableId, wallet: walletB, mint: mintB, pairMint, saltHex: saltB, rulesHashHex: rulesHash }), start: startB, end: endB, scoreBps: "1000", entitlementRaw: "0" },
    ],
  } as const;
  const valid = await validateResultManifest(manifest);
  assert.equal(valid.ok, true);
  const tampered = { ...manifest, entries: [{ ...manifest.entries[0], entitlementRaw: "99" }, manifest.entries[1]] };
  assert.deepEqual(await validateResultManifest(tampered), { ok: false, code: "MANIFEST_ENTITLEMENT_MISMATCH" });
});


import { parseRawAmount } from "../../domain/game/amounts";
import { createPickCommitment, createSealedMarketHash } from "../../domain/game/commitment";
import { allocatePot, calculateScoreBps } from "../../domain/game/scoring";
import { ResultManifestSchema, resultManifestHash, type ResultManifest } from "../../domain/game/manifest";

export type ManifestValidation = { ok: true; manifestHash: string } | { ok: false; code: string };

export async function validateResultManifest(value: unknown): Promise<ManifestValidation> {
  const parsed = ResultManifestSchema.safeParse(value);
  if (!parsed.success) return { ok: false, code: "MANIFEST_SCHEMA_INVALID" };
  const manifest: ResultManifest = parsed.data;
  const scores: { wallet: string; scoreBps: bigint }[] = [];
  for (const entry of manifest.entries) {
    if (entry.start.phase !== "start" || entry.end.phase !== "end" || entry.start.pairAddress !== entry.end.pairAddress) return { ok: false, code: "MANIFEST_SAMPLE_MISMATCH" };
    if (await createPickCommitment({ tableId: manifest.tableId, wallet: entry.wallet, mint: entry.mint, saltHex: entry.saltHex }) !== entry.commitment) return { ok: false, code: "MANIFEST_COMMITMENT_MISMATCH" };
    if (await createSealedMarketHash({ tableId: manifest.tableId, wallet: entry.wallet, mint: entry.mint, pairMint: entry.pairMint, saltHex: entry.saltHex, rulesHashHex: manifest.rulesHash }) !== entry.sealedMarketHash) return { ok: false, code: "MANIFEST_MARKET_MISMATCH" };
    let score: string;
    try { score = calculateScoreBps(entry.start.price18, entry.end.price18); } catch { return { ok: false, code: "MANIFEST_SCORE_MISMATCH" }; }
    if (score !== entry.scoreBps) return { ok: false, code: "MANIFEST_SCORE_MISMATCH" };
    scores.push({ wallet: entry.wallet, scoreBps: BigInt(score) });
  }
  try { parseRawAmount(manifest.potRaw); } catch { return { ok: false, code: "MANIFEST_POT_INVALID" }; }
  const winningScore = scores.reduce((best, score) => score.scoreBps > best ? score.scoreBps : best, scores[0]!.scoreBps);
  const allocation = allocatePot(manifest.potRaw, scores.filter((score) => score.scoreBps === winningScore).map((score) => score.wallet));
  for (const entry of manifest.entries) if ((allocation.get(entry.wallet) ?? "0") !== entry.entitlementRaw) return { ok: false, code: "MANIFEST_ENTITLEMENT_MISMATCH" };
  return { ok: true, manifestHash: resultManifestHash(manifest) };
}

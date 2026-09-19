import { createHash } from "node:crypto";
import { z } from "zod";
import { SignedBpsSchema, SolanaAddressSchema } from "./api-contracts";
import { PriceSampleSchema } from "./capture";

export const ResultManifestSchema = z.object({
  schemaVersion: z.literal("kova-result-v1"),
  tableId: z.uuid(),
  genesisHash: z.string().min(32),
  programId: SolanaAddressSchema,
  rulesHash: z.string().regex(/^[0-9a-f]{64}$/),
  rosterHash: z.string().regex(/^[0-9a-f]{64}$/),
  startTargetAt: z.iso.datetime(),
  endTargetAt: z.iso.datetime(),
  entries: z.array(z.object({
    wallet: SolanaAddressSchema,
    mint: SolanaAddressSchema,
    pairMint: SolanaAddressSchema,
    saltHex: z.string().regex(/^[0-9a-f]{64}$/),
    commitment: z.string().regex(/^[0-9a-f]{64}$/),
    sealedMarketHash: z.string().regex(/^[0-9a-f]{64}$/),
    start: PriceSampleSchema,
    end: PriceSampleSchema,
    scoreBps: SignedBpsSchema,
    entitlementRaw: z.string().regex(/^(0|[1-9][0-9]*)$/),
  }).strict()).min(2).max(6),
  potRaw: z.string().regex(/^[1-9][0-9]*$/),
  createdAt: z.iso.datetime(),
}).strict();

export type ResultManifest = z.infer<typeof ResultManifestSchema>;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function resultManifestHash(manifest: ResultManifest): string {
  return createHash("sha256").update(canonical(manifest)).digest("hex");
}


/**
 * NEAR mode configuration. Off unless KOVA_NEAR_ENABLED=true, so the Solana app is unchanged.
 * Keys are read from files outside the repository (one `ed25519:...` string per file), like the
 * Solana keypairs; environment values only name the files.
 */
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { NearNetworkId } from "../../adapters/near/chip";

const schema = z.object({
  KOVA_NEAR_ENABLED: z.enum(["true", "false"]).default("false"),
  NEAR_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  NEAR_RPC_URL: z.string().url().optional(),
  NEAR_CHIP_CONTRACT: z.string().min(2).optional(),
  NEAR_SETTLER_ACCOUNT: z.string().min(2).optional(),
  NEAR_SETTLER_KEY_FILE: z.string().min(1).optional(),
  NEAR_HOUSE_ACCOUNT: z.string().min(2).optional(),
  NEAR_HOUSE_KEY_FILE: z.string().min(1).optional(),
  NEAR_HOUSE_MAX_OPEN_TABLES: z.coerce.number().int().min(0).max(50).default(6),
  NEAR_SETTLER_TICK_MS: z.coerce.number().int().min(1_000).max(60_000).default(3_000),
  // The House's brain on NEAR AI Cloud. No key, or a limit of 0, means the fixed rule only.
  NEAR_AI_API_KEY_FILE: z.string().min(1).optional(),
  NEAR_AI_MODEL: z.string().min(3).default("deepseek-ai/DeepSeek-V4.1-Flash-1017"),
  NEAR_AI_DAILY_LIMIT: z.coerce.number().int().min(0).max(5_000).default(300),
  // Email sign-in: new Privy email accounts get this much testnet NEAR from the sponsor, once per login.
  // The sponsor is its own account, so funding can never drain the settler's gas. No sponsor, or a
  // cap of 0, turns email sign-in off.
  NEAR_SPONSOR_ACCOUNT: z.string().min(2).optional(),
  NEAR_SPONSOR_KEY_FILE: z.string().min(1).optional(),
  NEAR_EMAIL_FUND_YOCTO: z.string().regex(/^\d+$/).default("100000000000000000000000"),
  NEAR_EMAIL_DAILY_CAP: z.coerce.number().int().min(0).max(10_000).default(50),
});

export type NearConfig = {
  network: NearNetworkId;
  rpcUrl?: string;
  contractId: string;
  settlerAccount: string;
  settlerKey: `ed25519:${string}`;
  houseAccount: string;
  houseKey: `ed25519:${string}`;
  houseMaxOpenTables: number;
  tickMs: number;
  ai: { apiKey: string | null; model: string; dailyLimit: number };
  /** Null when no sponsor is configured: email sign-in is then off. */
  email: { sponsorAccount: string; sponsorKey: `ed25519:${string}`; fundYocto: bigint; dailyCap: number } | null;
};

function readKey(path: string, label: string): `ed25519:${string}` {
  const key = readFileSync(path, "utf8").trim();
  if (!/^ed25519:[1-9A-HJ-NP-Za-km-z]{60,}$/.test(key)) throw new Error(`${label} key file does not hold an ed25519 key.`);
  return key as `ed25519:${string}`;
}

/** Returns null when NEAR mode is off. Throws when it is on but incomplete. */
export function loadNearConfig(environment: Record<string, string | undefined> = process.env): NearConfig | null {
  const parsed = schema.parse(environment);
  if (parsed.KOVA_NEAR_ENABLED !== "true") return null;
  const missing = (["NEAR_CHIP_CONTRACT", "NEAR_SETTLER_ACCOUNT", "NEAR_SETTLER_KEY_FILE", "NEAR_HOUSE_ACCOUNT", "NEAR_HOUSE_KEY_FILE"] as const).filter((k) => !parsed[k]);
  if (missing.length) throw new Error(`NEAR mode is on but these are missing: ${missing.join(", ")}`);
  return {
    network: parsed.NEAR_NETWORK,
    rpcUrl: parsed.NEAR_RPC_URL,
    contractId: parsed.NEAR_CHIP_CONTRACT as string,
    settlerAccount: parsed.NEAR_SETTLER_ACCOUNT as string,
    settlerKey: readKey(parsed.NEAR_SETTLER_KEY_FILE as string, "Settler"),
    houseAccount: parsed.NEAR_HOUSE_ACCOUNT as string,
    houseKey: readKey(parsed.NEAR_HOUSE_KEY_FILE as string, "House"),
    houseMaxOpenTables: parsed.NEAR_HOUSE_MAX_OPEN_TABLES,
    tickMs: parsed.NEAR_SETTLER_TICK_MS,
    ai: {
      apiKey: parsed.NEAR_AI_API_KEY_FILE ? readFileSync(parsed.NEAR_AI_API_KEY_FILE, "utf8").trim() || null : null,
      model: parsed.NEAR_AI_MODEL,
      dailyLimit: parsed.NEAR_AI_DAILY_LIMIT,
    },
    email:
      parsed.NEAR_SPONSOR_ACCOUNT && parsed.NEAR_SPONSOR_KEY_FILE
        ? {
          sponsorAccount: parsed.NEAR_SPONSOR_ACCOUNT,
          sponsorKey: readKey(parsed.NEAR_SPONSOR_KEY_FILE, "Sponsor"),
          fundYocto: BigInt(parsed.NEAR_EMAIL_FUND_YOCTO),
          dailyCap: parsed.NEAR_EMAIL_DAILY_CAP,
        }
        : null,
  };
}

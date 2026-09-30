import { z } from "zod";

const OptionalUrlSchema = z.preprocess(
  (value) => typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z.url().optional(),
);

const EnvironmentSchema = z.object({
  KOVA_BACKEND_HOST: z.string().trim().min(1).default("0.0.0.0"),
  KOVA_BACKEND_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  KOVA_ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
  KOVA_SOLANA_RPC_URL: OptionalUrlSchema.refine((value) => value === undefined || value.startsWith("https://"), "Solana RPC URL must use HTTPS."),
  KOVA_DATABASE_URL: OptionalUrlSchema.refine((value) => value === undefined || value.startsWith("postgres://") || value.startsWith("postgresql://"), "Database URL must use PostgreSQL."),
  KOVA_RECONCILIATION_INTERVAL_SECONDS: z.coerce.number().int().min(60).max(86400).default(300),
  KOVA_GAME_ENABLED: z.enum(["true", "false"]).default("false"),
  PRIVY_APP_ID: z.string().trim().min(1).optional(),
  PRIVY_APP_SECRET: z.string().trim().min(1).optional(),
  KOVA_PICK_KEY_ID: z.string().trim().min(1).optional(),
  KOVA_PICK_ENCRYPTION_KEY: z.string().trim().min(1).optional(),
  KOVA_PICK_PREVIOUS_ENCRYPTION_KEYS: z.string().default(""),
  KOVA_ANSEM_MINT: z.string().trim().min(32).max(44).optional(),
  // On-chain escrow. All optional: without them the game runs without deposits.
  KOVA_CHAIN_NETWORK: z.preprocess((value) => value === "" ? undefined : value, z.enum(["solana-devnet", "solana-mainnet"]).optional()),
  KOVA_CHAIN_RPC_URL: OptionalUrlSchema.refine((value) => value === undefined || value.startsWith("https://"), "Chain RPC URL must use HTTPS."),
  KOVA_OPERATOR_KEYPAIR_PATH: z.string().trim().min(1).optional(),
  KOVA_ORACLE_KEYPAIR_PATH: z.string().trim().min(1).optional(),
  KOVA_ADMISSION_KEYPAIR_PATH: z.string().trim().min(1).optional(),
  KOVA_ROUND_SECONDS: z.coerce.number().int().min(60).max(900).default(900),
  CLAWPUMP_API_KEY: z.string().trim().min(1).optional(),
  KOVA_DEALER_AGENT_ID: z.string().trim().min(1).optional(),
  // ClawPump ends agent turns at about 60 s; tool-using turns and the agent's stored model overran it on 2026-09-27.
  KOVA_DEALER_MODEL: z.string().trim().min(1).optional(),
  KOVA_DEALER_TOOL_BUDGET: z.coerce.number().int().min(0).max(2).default(0),
  // The House trader (house-trader.ts). Its brain is a separate ClawPump agent; without one it trades by rule.
  KOVA_HOUSE_ENABLED: z.enum(["true", "false"]).default("false"),
  KOVA_HOUSE_AGENT_ID: z.string().trim().min(1).optional(),
  KOVA_HOUSE_MODEL: z.string().trim().min(1).optional(),
}).superRefine((value, context) => {
  if (value.KOVA_GAME_ENABLED !== "true") return;
  for (const field of ["KOVA_DATABASE_URL", "PRIVY_APP_ID", "PRIVY_APP_SECRET", "KOVA_PICK_KEY_ID", "KOVA_PICK_ENCRYPTION_KEY", "KOVA_ANSEM_MINT"] as const) {
    if (!value[field]) context.addIssue({ code: "custom", path: [field], message: `${field} is required when KOVA_GAME_ENABLED=true.` });
  }
  if (value.KOVA_CHAIN_NETWORK) {
    for (const field of ["KOVA_CHAIN_RPC_URL", "KOVA_OPERATOR_KEYPAIR_PATH", "KOVA_ORACLE_KEYPAIR_PATH", "KOVA_ADMISSION_KEYPAIR_PATH", "KOVA_SOLANA_RPC_URL"] as const) {
      if (!value[field]) context.addIssue({ code: "custom", path: [field], message: `${field} is required when KOVA_CHAIN_NETWORK is set.` });
    }
  }
  if (Boolean(value.CLAWPUMP_API_KEY) !== Boolean(value.KOVA_DEALER_AGENT_ID)) {
    context.addIssue({ code: "custom", path: ["KOVA_DEALER_AGENT_ID"], message: "CLAWPUMP_API_KEY and KOVA_DEALER_AGENT_ID must be set together." });
  }
});

export interface ChainConfig {
  network: "solana-devnet" | "solana-mainnet";
  rpcUrl: string;
  operatorKeypairPath: string;
  oracleKeypairPath: string;
  admissionKeypairPath: string;
  roundSeconds: number;
}

export interface BackendConfig {
  host: string;
  port: number;
  allowedOrigins: readonly string[];
  solanaRpcUrl: string | null;
  databaseUrl: string | null;
  reconciliationIntervalSeconds: number;
  gameEnabled: boolean;
  privyAppId: string | null;
  privyAppSecret: string | null;
  pickKeyId: string | null;
  pickEncryptionKey: string | null;
  pickPreviousEncryptionKeys: string;
  ansemMint: string | null;
  chain: ChainConfig | null;
  dealer: { apiKey: string; agentId: string; model?: string; toolBudget: 0 | 1 | 2 } | null;
  house: { enabled: boolean; brain: { apiKey: string; agentId: string; model: string } | null };
  mode: "preview";
}

export function loadBackendConfig(environment: Record<string, string | undefined> = process.env): BackendConfig {
  const parsed = EnvironmentSchema.safeParse(environment);
  if (!parsed.success) {
    throw new Error(`Invalid KOVA backend configuration: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  }

  const allowedOrigins = parsed.data.KOVA_ALLOWED_ORIGINS
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    host: parsed.data.KOVA_BACKEND_HOST,
    port: parsed.data.KOVA_BACKEND_PORT,
    allowedOrigins,
    solanaRpcUrl: parsed.data.KOVA_SOLANA_RPC_URL ?? null,
    databaseUrl: parsed.data.KOVA_DATABASE_URL ?? null,
    reconciliationIntervalSeconds: parsed.data.KOVA_RECONCILIATION_INTERVAL_SECONDS,
    gameEnabled: parsed.data.KOVA_GAME_ENABLED === "true",
    privyAppId: parsed.data.PRIVY_APP_ID ?? null,
    privyAppSecret: parsed.data.PRIVY_APP_SECRET ?? null,
    pickKeyId: parsed.data.KOVA_PICK_KEY_ID ?? null,
    pickEncryptionKey: parsed.data.KOVA_PICK_ENCRYPTION_KEY ?? null,
    pickPreviousEncryptionKeys: parsed.data.KOVA_PICK_PREVIOUS_ENCRYPTION_KEYS,
    ansemMint: parsed.data.KOVA_ANSEM_MINT ?? null,
    chain: parsed.data.KOVA_GAME_ENABLED === "true" && parsed.data.KOVA_CHAIN_NETWORK ? {
      network: parsed.data.KOVA_CHAIN_NETWORK,
      rpcUrl: parsed.data.KOVA_CHAIN_RPC_URL as string,
      operatorKeypairPath: parsed.data.KOVA_OPERATOR_KEYPAIR_PATH as string,
      oracleKeypairPath: parsed.data.KOVA_ORACLE_KEYPAIR_PATH as string,
      admissionKeypairPath: parsed.data.KOVA_ADMISSION_KEYPAIR_PATH as string,
      roundSeconds: parsed.data.KOVA_ROUND_SECONDS,
    } : null,
    dealer: parsed.data.CLAWPUMP_API_KEY && parsed.data.KOVA_DEALER_AGENT_ID ? {
      apiKey: parsed.data.CLAWPUMP_API_KEY,
      agentId: parsed.data.KOVA_DEALER_AGENT_ID,
      model: parsed.data.KOVA_DEALER_MODEL,
      toolBudget: parsed.data.KOVA_DEALER_TOOL_BUDGET as 0 | 1 | 2,
    } : null,
    house: {
      enabled: parsed.data.KOVA_HOUSE_ENABLED === "true",
      brain: parsed.data.CLAWPUMP_API_KEY && parsed.data.KOVA_HOUSE_AGENT_ID
        ? { apiKey: parsed.data.CLAWPUMP_API_KEY, agentId: parsed.data.KOVA_HOUSE_AGENT_ID, model: parsed.data.KOVA_HOUSE_MODEL ?? "openai/gpt-5.4-mini" }
        : null,
    },
    mode: "preview",
  };
}

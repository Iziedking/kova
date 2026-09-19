import { z } from "zod";

const EnvironmentSchema = z.object({
  KOVA_BACKEND_HOST: z.string().trim().min(1).default("0.0.0.0"),
  KOVA_BACKEND_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  KOVA_ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
  KOVA_SOLANA_RPC_URL: z.url().refine((value) => value.startsWith("https://"), "Solana RPC URL must use HTTPS.").optional(),
  KOVA_DATABASE_URL: z.url().refine((value) => value.startsWith("postgres://") || value.startsWith("postgresql://"), "Database URL must use PostgreSQL.").optional(),
  KOVA_RECONCILIATION_INTERVAL_SECONDS: z.coerce.number().int().min(60).max(86400).default(300),
  KOVA_GAME_ENABLED: z.enum(["true", "false"]).default("false"),
  PRIVY_APP_ID: z.string().trim().min(1).optional(),
  PRIVY_APP_SECRET: z.string().trim().min(1).optional(),
  KOVA_PICK_KEY_ID: z.string().trim().min(1).optional(),
  KOVA_PICK_ENCRYPTION_KEY: z.string().trim().min(1).optional(),
  KOVA_PICK_PREVIOUS_ENCRYPTION_KEYS: z.string().default(""),
  KOVA_ANSEM_MINT: z.string().trim().min(32).max(44).optional(),
}).superRefine((value, context) => {
  if (value.KOVA_GAME_ENABLED !== "true") return;
  for (const field of ["KOVA_DATABASE_URL", "PRIVY_APP_ID", "PRIVY_APP_SECRET", "KOVA_PICK_KEY_ID", "KOVA_PICK_ENCRYPTION_KEY", "KOVA_ANSEM_MINT"] as const) {
    if (!value[field]) context.addIssue({ code: "custom", path: [field], message: `${field} is required when KOVA_GAME_ENABLED=true.` });
  }
});

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
    mode: "preview",
  };
}

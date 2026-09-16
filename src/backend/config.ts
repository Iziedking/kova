import { z } from "zod";

const EnvironmentSchema = z.object({
  KOVA_BACKEND_HOST: z.string().trim().min(1).default("0.0.0.0"),
  KOVA_BACKEND_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  KOVA_ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
  KOVA_SOLANA_RPC_URL: z.url().refine((value) => value.startsWith("https://"), "Solana RPC URL must use HTTPS.").optional(),
  KOVA_DATABASE_URL: z.url().refine((value) => value.startsWith("postgres://") || value.startsWith("postgresql://"), "Database URL must use PostgreSQL.").optional(),
  KOVA_RECONCILIATION_INTERVAL_SECONDS: z.coerce.number().int().min(60).max(86400).default(300),
});

export interface BackendConfig {
  host: string;
  port: number;
  allowedOrigins: readonly string[];
  solanaRpcUrl: string | null;
  databaseUrl: string | null;
  reconciliationIntervalSeconds: number;
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
    mode: "preview",
  };
}

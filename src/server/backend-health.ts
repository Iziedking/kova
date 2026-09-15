import { z } from "zod";

const BackendHealthSchema = z.object({
  product: z.literal("FLOAT"),
  mode: z.string(),
  status: z.literal("ok"),
  capabilities: z.object({
    database: z.string(),
    finalizedRpc: z.string(),
    marketReads: z.string(),
    stockCheck: z.string(),
    stockFloatMonitor: z.string(),
    campaigns: z.string(),
    underwriting: z.string(),
    walletConnection: z.string(),
    paidResearch: z.string(),
    walletSigning: z.string(),
    transactionPreparation: z.string(),
    automatedRebalancing: z.string(),
  }).passthrough(),
});

const DisabledFinancialCapabilities = ["walletSigning", "transactionPreparation", "automatedRebalancing"] as const;

export type BackendHealth = z.infer<typeof BackendHealthSchema>;

export type BackendHealthResult =
  | { ok: true; health: BackendHealth }
  | { ok: false; code: "BACKEND_CONFIGURATION_INVALID" | "BACKEND_UNAVAILABLE" | "BACKEND_CAPABILITY_MISMATCH"; message: string };

interface BackendHealthOptions {
  backendUrl?: string;
  fetcher?: typeof fetch;
}

function backendHealthUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    const localDevelopment = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(localDevelopment && url.protocol === "http:")) return null;
    return new URL("/api/health", url);
  } catch {
    return null;
  }
}

export async function fetchBackendHealth(options: BackendHealthOptions = {}): Promise<BackendHealthResult> {
  const configuredBackendUrl = options.backendUrl === undefined ? process.env.FLOAT_BACKEND_API_URL?.trim() ?? "" : options.backendUrl.trim();
  if (configuredBackendUrl.length === 0) return { ok: false, code: "BACKEND_CONFIGURATION_INVALID", message: "FLOAT_BACKEND_API_URL is not configured." };
  const url = backendHealthUrl(configuredBackendUrl);
  if (url === null) return { ok: false, code: "BACKEND_CONFIGURATION_INVALID", message: "The configured FLOAT backend URL must be HTTPS, except for local development." };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const response = await (options.fetcher ?? fetch)(url.toString(), { cache: "no-store", headers: { accept: "application/json" }, signal: controller.signal });
    if (!response.ok) return { ok: false, code: "BACKEND_UNAVAILABLE", message: "The FLOAT backend health endpoint is unavailable." };
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false, code: "BACKEND_UNAVAILABLE", message: "The FLOAT backend returned unreadable health data." };
    }
    const parsed = BackendHealthSchema.safeParse(body);
    if (!parsed.success) return { ok: false, code: "BACKEND_UNAVAILABLE", message: "The FLOAT backend returned invalid health data." };
    const enabledFinancialCapability = DisabledFinancialCapabilities.find((capability) => parsed.data.capabilities[capability] !== "unavailable");
    if (enabledFinancialCapability !== undefined) return { ok: false, code: "BACKEND_CAPABILITY_MISMATCH", message: `The backend reports ${enabledFinancialCapability} enabled while the deployment is expected to remain preview-only.` };
    return { ok: true, health: parsed.data };
  } catch {
    return { ok: false, code: "BACKEND_UNAVAILABLE", message: "The FLOAT backend health endpoint is unavailable." };
  } finally {
    clearTimeout(timeout);
  }
}

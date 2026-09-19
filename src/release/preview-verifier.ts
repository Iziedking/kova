import { z } from "zod";

const FrontendHealthSchema = z.object({
  product: z.literal("KOVA"),
  mode: z.literal("preview"),
  capabilities: z.object({
    dealerAdmission: z.literal("blocked"),
    walletSigning: z.literal("unavailable"),
    transactionPreparation: z.literal("unavailable"),
    automatedRebalancing: z.literal("unavailable"),
    ansemEscrow: z.literal("local_validator_only"),
    gameSettlement: z.literal("local_validator_only"),
    payoutExecution: z.literal("local_validator_only"),
  }).passthrough(),
});

const BackendHealthSchema = z.object({
  product: z.literal("KOVA"),
  mode: z.literal("preview"),
  status: z.literal("ok"),
  capabilities: z.object({
    dealerAdmission: z.literal("blocked"),
    walletSigning: z.literal("unavailable"),
    transactionPreparation: z.literal("unavailable"),
    automatedRebalancing: z.literal("unavailable"),
    ansemEscrow: z.literal("unavailable"),
    gameSettlement: z.literal("unavailable"),
    payoutExecution: z.literal("unavailable"),
  }).passthrough(),
});

const BackendLiveSchema = z.object({ product: z.literal("KOVA"), status: z.literal("alive") });
const BackendReadySchema = z.object({
  product: z.literal("KOVA"),
  readyToServe: z.literal(true),
  readyToAdmit: z.literal(false),
  readyToRecover: z.literal(false),
});
const FrontendBackendHealthSchema = z.object({
  ok: z.literal(true),
  source: z.literal("vm_backend"),
  health: BackendHealthSchema,
});

type PreviewCheckName = "frontend_health" | "frontend_backend_link" | "backend_live" | "backend_ready" | "backend_health";

export interface PreviewReleaseReceipt {
  schemaVersion: "kova-preview-release-v1";
  ok: boolean;
  mode: "preview";
  checkedAt: string;
  frontendOrigin: string;
  backendOrigin: string;
  checks: readonly { name: PreviewCheckName; url: string; ok: boolean; detail: string }[];
  limitations: readonly string[];
}

interface VerifyPreviewReleaseOptions {
  frontendUrl: string;
  backendUrl: string;
  fetcher?: typeof fetch;
  now?: () => Date;
}

function deploymentOrigin(value: string): URL | null {
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
    return new URL(url.origin);
  } catch {
    return null;
  }
}

async function checkJson(
  fetcher: typeof fetch,
  origin: URL,
  path: string,
  name: PreviewCheckName,
  schema: z.ZodType,
): Promise<{ name: PreviewCheckName; url: string; ok: boolean; detail: string }> {
  const url = new URL(path, origin);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetcher(url, { cache: "no-store", headers: { accept: "application/json" }, signal: controller.signal });
    if (!response.ok) return { name, url: url.toString(), ok: false, detail: `HTTP ${response.status}` };
    const body: unknown = await response.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return { name, url: url.toString(), ok: false, detail: "Response violates the preview release contract." };
    return { name, url: url.toString(), ok: true, detail: "Preview contract verified." };
  } catch {
    return { name, url: url.toString(), ok: false, detail: "Endpoint was unreachable or returned unreadable JSON." };
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyPreviewRelease(options: VerifyPreviewReleaseOptions): Promise<PreviewReleaseReceipt> {
  const frontend = deploymentOrigin(options.frontendUrl.trim());
  const backend = deploymentOrigin(options.backendUrl.trim());
  if (frontend === null || backend === null) throw new Error("Preview URLs must use HTTPS, except for localhost development.");
  const fetcher = options.fetcher ?? fetch;
  const checks = await Promise.all([
    checkJson(fetcher, frontend, "/api/health", "frontend_health", FrontendHealthSchema),
    checkJson(fetcher, frontend, "/api/backend-health", "frontend_backend_link", FrontendBackendHealthSchema),
    checkJson(fetcher, backend, "/api/live", "backend_live", BackendLiveSchema),
    checkJson(fetcher, backend, "/api/ready", "backend_ready", BackendReadySchema),
    checkJson(fetcher, backend, "/api/health", "backend_health", BackendHealthSchema),
  ]);
  return {
    schemaVersion: "kova-preview-release-v1",
    ok: checks.every((check) => check.ok),
    mode: "preview",
    checkedAt: (options.now ?? (() => new Date()))().toISOString(),
    frontendOrigin: frontend.origin,
    backendOrigin: backend.origin,
    checks,
    limitations: [
      "No production Dealer admission is enabled.",
      "No wallet signing, transaction preparation, ANSEM escrow, settlement, or payout is enabled.",
      "This receipt proves endpoint contracts, not value-bearing readiness or hackathon submission.",
    ],
  };
}

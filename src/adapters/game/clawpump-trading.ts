import { z } from "zod";

const BASE_URL = "https://clawpump.tech/api/v1";
const SolanaMint = z.string().trim().min(32).max(44);

export interface ClawPumpSwapRequest {
  inputMint: string;
  outputMint: string;
  amountUi: string;
  slippageBps?: number;
  agentId: string;
  agentWalletAddress?: string;
  userWallet?: string;
  acknowledgeHighRisk?: boolean;
  acknowledgeUnverified?: boolean;
}

export interface ClawPumpRequestResult {
  requestId: string | null;
  status: number;
  payload: unknown;
}

export interface ClawPumpUnsignedSwap extends ClawPumpRequestResult {
  unsignedTransaction: string;
}

interface ClawPumpTradingClientOptions {
  apiKey: string;
  fetcher?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

function requestId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null || !("meta" in payload)) return null;
  const meta = payload.meta;
  if (typeof meta !== "object" || meta === null || !("requestId" in meta) || typeof meta.requestId !== "string") return null;
  return meta.requestId;
}

function bodyForSwap(input: ClawPumpSwapRequest, requireAgent: boolean): Record<string, string | number | boolean> {
  const parsed = z.object({
    inputMint: SolanaMint,
    outputMint: SolanaMint,
    amountUi: z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/),
    slippageBps: z.number().int().min(0).max(5_000).default(50),
    agentId: z.string().trim().min(1),
    userWallet: SolanaMint.optional(),
    acknowledgeHighRisk: z.boolean().optional(),
    acknowledgeUnverified: z.boolean().optional(),
  }).parse(input);
  if (parsed.userWallet && input.agentWalletAddress && parsed.userWallet !== input.agentWalletAddress) {
    throw new Error("ClawPump user_wallet must equal the agent wallet address.");
  }
  if (parsed.userWallet && !input.agentWalletAddress) {
    throw new Error("ClawPump agent wallet address is required before user_wallet can be sent.");
  }
  const body: Record<string, string | number | boolean> = {
    input_mint: parsed.inputMint,
    output_mint: parsed.outputMint,
    amount: parsed.amountUi,
    slippage_bps: parsed.slippageBps,
  };
  if (requireAgent || parsed.agentId) body.agent_id = parsed.agentId;
  if (parsed.userWallet) body.user_wallet = parsed.userWallet;
  if (parsed.acknowledgeHighRisk !== undefined) body.acknowledgeHighRisk = parsed.acknowledgeHighRisk;
  if (parsed.acknowledgeUnverified !== undefined) body.acknowledgeUnverified = parsed.acknowledgeUnverified;
  return body;
}

export class ClawPumpTradingClient {
  private readonly fetcher: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly options: ClawPumpTradingClientOptions) {
    if (!options.apiKey.startsWith("cpk_")) throw new Error("ClawPump API keys must start with cpk_.");
    this.fetcher = options.fetcher ?? fetch;
    this.baseUrl = (options.baseUrl ?? BASE_URL).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async quote(input: ClawPumpSwapRequest): Promise<ClawPumpRequestResult> {
    return this.post("/swap/quote", bodyForSwap(input, false));
  }

  async prepareUnsignedSwap(input: ClawPumpSwapRequest): Promise<ClawPumpUnsignedSwap> {
    const result = await this.post("/swap/execute", bodyForSwap(input, true));
    if (typeof result.payload !== "object" || result.payload === null || !("unsignedTransaction" in result.payload) || typeof result.payload.unsignedTransaction !== "string") {
      throw new Error("ClawPump returned no unsignedTransaction; no trade can be submitted.");
    }
    return { ...result, unsignedTransaction: result.payload.unsignedTransaction };
  }

  private async post(path: string, body: Record<string, string | number | boolean>): Promise<ClawPumpRequestResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.options.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const id = requestId(payload);
        throw new Error(`ClawPump ${path} failed with HTTP ${response.status}${id ? ` (${id})` : ""}.`);
      }
      return { requestId: requestId(payload), status: response.status, payload };
    } finally {
      clearTimeout(timeout);
    }
  }
}

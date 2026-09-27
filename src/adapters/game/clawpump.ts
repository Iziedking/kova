/** ClawPump Partner API v1 chat adapter, official /developers contract checked 2026-09-19. */
import { z } from "zod";

const ChatResponseSchema = z.object({
  content: z.string().optional(),
  reply: z.string().optional(),
  model: z.string().optional(),
  cost: z.number().optional(),
  cost_usd: z.number().optional(),
  tools_used: z.array(z.string()).optional(),
  meta: z.object({ requestId: z.string().optional() }).passthrough().optional(),
}).passthrough().refine((value) => typeof value.content === "string" || typeof value.reply === "string", "ClawPump response has no agent content.");

export interface ClawPumpChatReceipt {
  rawOutput: string;
  model: string | null;
  costUsd: number;
  toolsUsed: readonly string[];
  requestId: string | null;
}

export class ClawPumpAdmissionClient {
  /** `model` overrides the agent's stored model for this call, per the /developers Chat contract. */
  constructor(private readonly input: { apiKey: string; agentId: string; model?: string; fetcher?: typeof fetch }) {}

  async classify(message: string): Promise<ClawPumpChatReceipt> {
    const fetcher = this.input.fetcher ?? fetch;
    const response = await fetcher(`https://clawpump.tech/api/v1/agents/${this.input.agentId}/chat`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.input.apiKey}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ message, temperature: 0, ...(this.input.model ? { model: this.input.model } : {}) }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      // Error bodies carry ClawPump's code (for example free_quota_exceeded); keep a short, key-free excerpt.
      const excerpt = (await response.text().catch(() => "")).replace(/cpk_[A-Za-z0-9_-]+/g, "cpk_REDACTED").slice(0, 160);
      throw new Error(`ClawPump chat returned HTTP ${response.status}${excerpt ? `: ${excerpt}` : ""}.`);
    }
    const parsed = ChatResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error("ClawPump chat returned an unexpected payload.");
    return {
      rawOutput: parsed.data.content ?? parsed.data.reply as string,
      model: parsed.data.model ?? null,
      costUsd: parsed.data.cost ?? parsed.data.cost_usd ?? 0,
      toolsUsed: parsed.data.tools_used ?? [],
      requestId: parsed.data.meta?.requestId ?? null,
    };
  }
}


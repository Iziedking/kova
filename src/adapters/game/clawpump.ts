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
  constructor(private readonly input: { apiKey: string; agentId: string; fetcher?: typeof fetch }) {}

  async classify(message: string): Promise<ClawPumpChatReceipt> {
    const fetcher = this.input.fetcher ?? fetch;
    const response = await fetcher(`https://clawpump.tech/api/v1/agents/${this.input.agentId}/chat`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.input.apiKey}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ message, temperature: 0 }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`ClawPump chat returned HTTP ${response.status}.`);
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


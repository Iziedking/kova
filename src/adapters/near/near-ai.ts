/**
 * The House's brain on NEAR AI Cloud (OpenAI-compatible, https://cloud-api.near.ai/v1, model list
 * read 2026-11-12). One seam: the House asks for a pick among the listed markets and a one-line
 * reason. Any failure, timeout, malformed answer or spent budget returns null, and the House uses
 * its fixed rule instead and says so.
 *
 * Cost: at most `dailyLimit` calls a UTC day (default 300), 160 output tokens each. A missing key
 * or a limit of 0 means no calls at all.
 */
import { z } from "zod";

export type HouseCandidate = { market: string; symbol: string; change1hPct: number | null; liquidityUsd: number };
export type HouseChoice = { market: string; reason: string; model: string };

const answer = z.object({ market: z.string(), reason: z.string().min(3).max(240) });

export class NearAiHouseBrain {
  private day = -1;
  private used = 0;

  constructor(
    private readonly input: { apiKey: string | null; model: string; dailyLimit: number; fetcher?: typeof fetch; baseUrl?: string },
  ) {}

  get enabled() {
    return Boolean(this.input.apiKey) && this.input.dailyLimit > 0;
  }

  private takeBudget(): boolean {
    const today = Math.floor(Date.now() / 86_400_000);
    if (today !== this.day) {
      this.day = today;
      this.used = 0;
    }
    if (this.used >= this.input.dailyLimit) return false;
    this.used += 1;
    return true;
  }

  async choose(candidates: readonly HouseCandidate[]): Promise<HouseChoice | null> {
    if (!this.enabled || candidates.length === 0 || !this.takeBudget()) return null;
    const list = candidates
      .map((c) => `${c.market} (${c.symbol}): ${c.change1hPct === null ? "no 1h figure" : `${c.change1hPct}% in 1h`}, $${Math.round(c.liquidityUsd)} liquidity`)
      .join("\n");
    try {
      const response = await (this.input.fetcher ?? fetch)(`${this.input.baseUrl ?? "https://cloud-api.near.ai/v1"}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.input.apiKey}` },
        signal: AbortSignal.timeout(8_000),
        body: JSON.stringify({
          model: this.input.model,
          max_tokens: 160,
          temperature: 0.4,
          messages: [
            {
              role: "system",
              content:
                "You are the House in a poker-style game. Each player picks one NEAR memecoin; the best percentage price move over the next few minutes wins. Choose the coin you expect to rise most. Answer only with JSON: {\"market\": \"<exact id from the list>\", \"reason\": \"<one plain sentence, under 25 words>\"}.",
            },
            { role: "user", content: `Coins:\n${list}` },
          ],
        }),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const text = body.choices?.[0]?.message?.content ?? "";
      const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
      const parsed = answer.safeParse(JSON.parse(json));
      if (!parsed.success || !candidates.some((c) => c.market === parsed.data.market)) return null;
      return { market: parsed.data.market, reason: parsed.data.reason.trim(), model: this.input.model };
    } catch {
      return null;
    }
  }
}

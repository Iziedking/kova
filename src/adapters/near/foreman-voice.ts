/**
 * The Foreman's optional AI remark. The recap's facts always come from the template
 * (src/adapters/near/foreman.ts); an AI may only add one short sentence after it, and that sentence
 * is rejected if it contains a number the facts do not, a link, a handle or a second line. With no key,
 * or on any failure, there is no remark and the post says `by: "rule"`.
 *
 * Backends, tried in order, both OpenAI-compatible chat completions with a Bearer key:
 *  - NEAR AI Cloud  https://cloud-api.near.ai/v1  (the same shape the House uses in near-ai.ts). The key is the one
 *    the House already uses; no token needs to be held.
 *  - BRRRAIN  https://api.brrrain.fun/v1  (docs: brrrain.fun/docs/api/), the backup. The key (`brrr_...`) is made by
 *    a person at brrrain.fun/app/keys, and the NEAR account behind it must hold at least 1 BRRRAIN.
 *    quota_exhausted (402) means stop until the next 00:00 UTC; no_tokens (403) means this key cannot
 *    be used. The default model is a reasoning model, whose thinking also spends max_tokens.
 *
 * NOT RUN with a real key: no BRRRAIN or NEAR AI key exists on the machine this was written on. The
 * code is tested against a fake server, and the BRRRAIN public endpoints it relies on (/v1/models,
 * /v1/public/config) were read live on 2026-11-14.
 */
export const BRRRAIN_BASE_URL = "https://api.brrrain.fun/v1";
export const NEAR_AI_BASE_URL = "https://cloud-api.near.ai/v1";
export const BRRRAIN_DEFAULT_MODEL = "z-ai/glm-5.3-flash";
/** The model the House already uses on NEAR AI Cloud (.env.example), so a key alone is enough. */
export const NEAR_AI_DEFAULT_MODEL = "deepseek-ai/DeepSeek-V4.1-Flash-1017";

export type VoiceBackend = { id: "brrrain" | "near-ai"; baseUrl: string; apiKey: string; model: string };
export type Remark = { text: string; model: string; via: VoiceBackend["id"]; powerRemaining: number | null };

const SYSTEM = [
  "You are the Foreman, an account that mines next to people in Kova, a NEAR mining game for memecoins.",
  "Say one plain sentence, 25 words at most, about the round described by the user.",
  "Do not repeat the facts; react to them like a miner would. Use only the facts you are given. Do not add numbers, names, prices or advice. No links, no hashtags, no emoji.",
].join(" ");

const digits = (text: string) => text.match(/\d+(?:[.,]\d+)?/g) ?? [];

/** The remark if it is safe to post next to `facts`, else null. */
export function acceptRemark(raw: string, facts: string): string | null {
  const text = raw.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  if (text.length < 10 || text.length > 200) return null;
  if (/[\r\n]/.test(text)) return null;
  if (/https?:|www\.|[@#]/i.test(text)) return null;
  const known = new Set(digits(facts));
  if (digits(text).some((n) => !known.has(n))) return null;
  return text;
}

/** Seconds from `now` (ms) to the next 00:00 UTC, when BRRRAIN's daily Power refills. */
export const nextUtcMidnight = (now: number) => (Math.floor(now / 86_400_000) + 1) * 86_400_000;

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export class ForemanVoice {
  /** A backend that must not be called again until this time (ms). Infinity means for this run. */
  private readonly pausedUntil = new Map<VoiceBackend["id"], number>();

  constructor(
    private readonly backends: readonly VoiceBackend[],
    private readonly fetcher: Fetcher = fetch,
    private readonly now: () => number = Date.now,
    private readonly timeoutMs = 25_000,
  ) {}

  get enabled() {
    return this.backends.some((b) => (this.pausedUntil.get(b.id) ?? 0) <= this.now());
  }

  /** One remark about the facts, or null. Never throws, and never retries inside a round. */
  async remark(facts: string): Promise<Remark | null> {
    for (const backend of this.backends) {
      if ((this.pausedUntil.get(backend.id) ?? 0) > this.now()) continue;
      try {
        const response = await this.fetcher(`${backend.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${backend.apiKey}` },
          signal: AbortSignal.timeout(this.timeoutMs),
          // A reasoning model spends max_tokens on its thinking first, so leave it room (BRRRAIN docs: 1,000 or more).
          body: JSON.stringify({ model: backend.model, max_tokens: 1_200, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: facts }] }),
        });
        if (!response.ok) {
          const code = ((await response.json().catch(() => null)) as { error?: { code?: string } } | null)?.error?.code;
          if (response.status === 402 && code === "quota_exhausted") this.pausedUntil.set(backend.id, nextUtcMidnight(this.now()));
          else if (response.status === 403 || response.status === 401) this.pausedUntil.set(backend.id, Infinity); // this key cannot be used
          continue; // 429, 503, max_tokens_too_high and the rest: skip this round
        }
        const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
        const content = body.choices?.[0]?.message?.content;
        const text = typeof content === "string" ? acceptRemark(content, facts) : null;
        if (!text) continue;
        const left = Number(response.headers.get("x-brrrain-power-remaining"));
        return { text, model: backend.model, via: backend.id, powerRemaining: backend.id === "brrrain" && Number.isFinite(left) ? left : null };
      } catch {
        // A timeout or a network error: no remark this round.
      }
    }
    return null;
  }
}

/**
 * Backends from the environment, in the order they are tried: NEAR_AI_API_KEY_FILE (and NEAR_AI_MODEL, which
 * defaults to the House's model), then BRRRAIN_API_KEY_FILE (and BRRRAIN_MODEL). A key file holds one key, outside the repository. A missing file or an empty
 * key means that backend is not used. Keys are never logged.
 */
export function backendsFromEnv(env: Record<string, string | undefined>, readFile: (path: string) => string): VoiceBackend[] {
  const out: VoiceBackend[] = [];
  const key = (path: string | undefined) => {
    if (!path) return null;
    try {
      return readFile(path).trim() || null;
    } catch {
      return null;
    }
  };
  const nearAi = key(env.NEAR_AI_API_KEY_FILE);
  if (nearAi) out.push({ id: "near-ai", baseUrl: NEAR_AI_BASE_URL, apiKey: nearAi, model: env.NEAR_AI_MODEL || NEAR_AI_DEFAULT_MODEL });
  const brrrain = key(env.BRRRAIN_API_KEY_FILE);
  if (brrrain) out.push({ id: "brrrain", baseUrl: BRRRAIN_BASE_URL, apiKey: brrrain, model: env.BRRRAIN_MODEL || BRRRAIN_DEFAULT_MODEL });
  return out;
}

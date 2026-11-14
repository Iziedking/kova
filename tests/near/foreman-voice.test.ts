import assert from "node:assert/strict";
import { test } from "node:test";
import { BRRRAIN_BASE_URL, ForemanVoice, NEAR_AI_BASE_URL, NEAR_AI_DEFAULT_MODEL, acceptRemark, backendsFromEnv, nextUtcMidnight, type VoiceBackend } from "../../src/adapters/near/foreman-voice";

const FACTS = "Round 29910942: square 3 won. 1 player staked 20 CHIP; 1 CHIP was burned. The Foreman had 20 CHIP on squares 16 and 3 and won 19 CHIP back.";
const BRRRAIN: VoiceBackend = { id: "brrrain", baseUrl: BRRRAIN_BASE_URL, apiKey: "brrr_test", model: "z-ai/glm-5.3-flash" };
const NEAR_AI: VoiceBackend = { id: "near-ai", baseUrl: NEAR_AI_BASE_URL, apiKey: "nai_test", model: "some/model" };

const completion = (content: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "content-type": "application/json", ...headers } });
const failure = (status: number, code: string) => new Response(JSON.stringify({ error: { message: code, type: "x", code, param: null } }), { status });

test("a remark is accepted only if it adds no number, link, handle or line break", () => {
  assert.equal(acceptRemark("A quiet one, and the Foreman broke even.", FACTS), "A quiet one, and the Foreman broke even.");
  assert.equal(acceptRemark('"The Foreman backed square 3 and it paid."', FACTS), "The Foreman backed square 3 and it paid.", "quotes are stripped; 3 is in the facts");
  assert.equal(acceptRemark("The Foreman is up 400 CHIP today.", FACTS), null, "400 is not in the facts");
  assert.equal(acceptRemark("See https://example.com for more.", FACTS), null);
  assert.equal(acceptRemark("Thanks @someone and #nearhackathon.", FACTS), null);
  assert.equal(acceptRemark("First line.\nSecond line.", FACTS), null);
  assert.equal(acceptRemark("ok", FACTS), null, "too short");
  assert.equal(acceptRemark("x".repeat(161), FACTS), null, "too long");
});

test("the remark call follows BRRRAIN's documented API", async () => {
  const seen: { url: string; headers: Record<string, string>; body: { model: string; max_tokens: number; messages: { role: string; content: string }[] } }[] = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    seen.push({ url, headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) });
    return completion("A calm round for the Foreman.", { "x-brrrain-power-remaining": "812.5" });
  };
  const remark = await new ForemanVoice([BRRRAIN], fetcher as typeof fetch).remark(FACTS);
  assert.deepEqual(remark, { text: "A calm round for the Foreman.", model: "z-ai/glm-5.3-flash", via: "brrrain", powerRemaining: 812.5 });
  assert.equal(seen[0].url, "https://api.brrrain.fun/v1/chat/completions");
  assert.equal(seen[0].headers.authorization, "Bearer brrr_test");
  assert.ok(seen[0].body.max_tokens >= 1000, "a reasoning model needs room to think");
  assert.equal(seen[0].body.messages[1].content, FACTS, "the user message is exactly the facts");
});

test("quota_exhausted stops BRRRAIN until the next 00:00 UTC, and the next backend takes over", async () => {
  let t = Date.UTC(2026, 10, 14, 13, 0, 0);
  const calls: string[] = [];
  const fetcher = async (url: string) => {
    calls.push(url);
    return url.includes("brrrain") ? failure(402, "quota_exhausted") : completion("Another round, another stake.");
  };
  const voice = new ForemanVoice([BRRRAIN, NEAR_AI], fetcher as typeof fetch, () => t);
  assert.equal((await voice.remark(FACTS))?.via, "near-ai", "falls through to the next backend");
  calls.length = 0;
  assert.equal((await voice.remark(FACTS))?.via, "near-ai");
  assert.ok(calls.every((u) => !u.includes("brrrain")), "BRRRAIN is not called again today");
  t = nextUtcMidnight(t) + 1;
  calls.length = 0;
  await voice.remark(FACTS);
  assert.ok(calls.some((u) => u.includes("brrrain")), "tried again after the refill");
});

test("no_tokens, a bad key and every failure mean no remark, never an exception", async () => {
  const run = (response: () => Response | Promise<Response>) => new ForemanVoice([BRRRAIN], (async () => response()) as typeof fetch).remark(FACTS);
  assert.equal(await run(() => failure(403, "no_tokens")), null);
  assert.equal(await run(() => failure(429, "rate_limited")), null);
  assert.equal(await run(() => failure(503, "upstream_unavailable")), null);
  assert.equal(await run(() => completion("")), null, "a reasoning model that used all its tokens thinking");
  assert.equal(await run(() => completion(null)), null);
  assert.equal(await run(() => new Response("not json", { status: 200 })), null);
  assert.equal(await run(() => completion("The Foreman won 999 CHIP.")), null, "an invented number is rejected");
  assert.equal(await new ForemanVoice([BRRRAIN], (async () => { throw new Error("network"); }) as typeof fetch).remark(FACTS), null);
  const stopped = new ForemanVoice([BRRRAIN], (async () => failure(403, "no_tokens")) as typeof fetch);
  await stopped.remark(FACTS);
  assert.equal(stopped.enabled, false, "a key that holds no BRRRAIN is not tried again this run");
});

test("backends come from key files, and a missing file or empty key means no backend", () => {
  const files: Record<string, string> = { "/k/brrrain": "brrr_abc\n", "/k/nearai": "nai_xyz", "/k/empty": "  \n" };
  const read = (p: string) => {
    if (!(p in files)) throw new Error("ENOENT");
    return files[p];
  };
  assert.deepEqual(backendsFromEnv({}, read), []);
  assert.deepEqual(backendsFromEnv({ BRRRAIN_API_KEY_FILE: "/k/empty" }, read), []);
  assert.deepEqual(backendsFromEnv({ BRRRAIN_API_KEY_FILE: "/k/missing" }, read), []);
  const both = backendsFromEnv({ BRRRAIN_API_KEY_FILE: "/k/brrrain", NEAR_AI_API_KEY_FILE: "/k/nearai", NEAR_AI_MODEL: "some/model" }, read);
  assert.deepEqual(both.map((b) => [b.id, b.apiKey, b.model]), [["near-ai", "nai_xyz", "some/model"], ["brrrain", "brrr_abc", "z-ai/glm-5.3-flash"]], "NEAR AI is tried first, BRRRAIN second");
  assert.deepEqual(backendsFromEnv({ NEAR_AI_API_KEY_FILE: "/k/nearai" }, read).map((b) => [b.id, b.model]), [["near-ai", NEAR_AI_DEFAULT_MODEL]], "a NEAR AI key alone is enough: it uses the House's model");
});

test("NEAR AI is asked first, and BRRRAIN answers only when NEAR AI cannot", async () => {
  const files: Record<string, string> = { "/k/n": "nai_xyz", "/k/b": "brrr_abc" };
  const backends = backendsFromEnv({ NEAR_AI_API_KEY_FILE: "/k/n", BRRRAIN_API_KEY_FILE: "/k/b" }, (p) => files[p]);
  const asked: string[] = [];
  let nearAiDown = false;
  const fetcher = async (url: string) => {
    asked.push(url.includes("near.ai") ? "near-ai" : "brrrain");
    return url.includes("near.ai") && nearAiDown ? failure(503, "upstream_unavailable") : completion("A quiet round for the Foreman.");
  };
  const voice = new ForemanVoice(backends, fetcher as typeof fetch);
  assert.equal((await voice.remark(FACTS))?.via, "near-ai");
  assert.deepEqual(asked, ["near-ai"], "BRRRAIN is not called while NEAR AI works");
  nearAiDown = true;
  asked.length = 0;
  assert.equal((await voice.remark(FACTS))?.via, "brrrain", "the backup takes over");
  assert.deepEqual(asked, ["near-ai", "brrrain"]);
});

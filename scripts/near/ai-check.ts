/**
 * Checks the Foreman's AI keys, so "the AI part" can be confirmed working before anything is recorded.
 *
 *   npm run ai:check              free checks only
 *   npm run ai:check -- --call    also asks the AI for one real sentence (a few Power on BRRRAIN)
 *
 * The Foreman asks NEAR AI Cloud first and BRRRAIN second (as the backup). Key files (one key per file,
 * outside the repository, mode 0600):
 *   NEAR_AI_API_KEY_FILE   default ~/.kova-testnet/nearai.key    the NEAR AI Cloud key the House already uses
 *   NEAR_AI_MODEL          default the House's model
 *   BRRRAIN_API_KEY_FILE   default ~/.kova-testnet/brrrain.key   a `brrr_...` key from brrrain.fun/app/keys,
 *                          for a NEAR account that holds at least 1 BRRRAIN
 * Keys are never printed. Exits 1 if no backend is usable.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { BRRRAIN_BASE_URL, BRRRAIN_DEFAULT_MODEL, ForemanVoice, NEAR_AI_BASE_URL, NEAR_AI_DEFAULT_MODEL, type VoiceBackend } from "../../src/adapters/near/foreman-voice";

const home = homedir();
const read = (path: string) => (existsSync(path) ? readFileSync(path, "utf8").trim() : "");
const brrrainFile = process.env.BRRRAIN_API_KEY_FILE ?? `${home}/.kova-testnet/brrrain.key`;
const nearAiFile = process.env.NEAR_AI_API_KEY_FILE ?? `${home}/.kova-testnet/nearai.key`;
const nearAiModel = process.env.NEAR_AI_MODEL || NEAR_AI_DEFAULT_MODEL;
const doCall = process.argv.includes("--call");
const usable: VoiceBackend[] = [];

function say(ok: boolean | null, line: string) {
  console.log(`${ok === null ? "    " : ok ? "ok  " : "FAIL"} ${line}`);
}

async function brrrain() {
  console.log("\nBRRRAIN (backup, brrrain.fun/docs)");
  const key = read(brrrainFile);
  if (!key) return say(false, `no key at ${brrrainFile}. Make one at https://brrrain.fun/app/keys (the account must hold at least 1 BRRRAIN), save it there, and run this again.`);
  say(null, `key found (${key.slice(0, 5)}…, ${key.length} characters)`);
  try {
    const response = await fetch(`${BRRRAIN_BASE_URL}/me`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
    if (response.status === 401) return say(false, "BRRRAIN rejected the key (401). Make a new one at brrrain.fun/app/keys.");
    if (!response.ok) return say(false, `BRRRAIN answered ${response.status}`);
    const me = (await response.json()) as { account_id?: string; balance?: string; holds_enough?: boolean; power_left?: number; resets_at?: string; key?: { daily_cap_power?: number; power_left?: number } | null };
    say(true, `the key works for ${me.account_id}`);
    const bal = me.balance ? Number(BigInt(me.balance) / 10n ** 14n) / 10_000 : null;
    say(me.holds_enough === true, `the account holds ${bal ?? "?"} BRRRAIN (at least 1 is needed): ${me.holds_enough ? "enough" : "NOT enough, so the API refuses it"}`);
    say((me.power_left ?? 0) > 0, `Power left today: ${me.power_left ?? "?"} (refills ${me.resets_at ?? "at 00:00 UTC"}); a message costs about 4 to 5`);
    if (me.key?.daily_cap_power !== undefined && me.key.daily_cap_power !== null) say(null, `this key's own daily cap: ${me.key.daily_cap_power}, left ${me.key.power_left}`);
    if (me.holds_enough && (me.power_left ?? 0) > 0) usable.push({ id: "brrrain", baseUrl: BRRRAIN_BASE_URL, apiKey: key, model: process.env.BRRRAIN_MODEL || BRRRAIN_DEFAULT_MODEL });
  } catch (error) {
    say(false, `could not reach BRRRAIN: ${(error as Error).message}`);
  }
}

async function nearAi() {
  console.log("NEAR AI Cloud (first choice)");
  const key = read(nearAiFile);
  if (!key) return say(false, `no key at ${nearAiFile}. Ask your partner for the NEAR AI Cloud key the House uses, save it there, and run this again.`);
  say(null, `key found (${key.length} characters)`);
  try {
    const response = await fetch(`${NEAR_AI_BASE_URL}/models`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
    if (response.status === 401 || response.status === 403) return say(false, `NEAR AI rejected the key (${response.status}).`);
    if (!response.ok) return say(false, `NEAR AI answered ${response.status}`);
    const body = (await response.json()) as { data?: { id?: string }[] };
    const ids = (body.data ?? []).map((m) => m.id);
    say(true, `the key works; ${ids.length} models listed`);
    say(ids.includes(nearAiModel), ids.includes(nearAiModel) ? `the model ${nearAiModel} is available` : `the model ${nearAiModel} is NOT in the list; set NEAR_AI_MODEL to one that is (for example ${ids[0] ?? "see the list"})`);
    if (ids.includes(nearAiModel)) usable.push({ id: "near-ai", baseUrl: NEAR_AI_BASE_URL, apiKey: key, model: nearAiModel });
  } catch (error) {
    say(false, `could not reach NEAR AI Cloud: ${(error as Error).message}`);
  }
}

async function main() {
  await nearAi(); // the order the Foreman tries them in
  await brrrain();
  console.log("");
  if (usable.length === 0) {
    console.log("RESULT: no AI backend is usable yet, so the Foreman posts plain templates and the site says so. Fix the lines marked FAIL above.");
    process.exit(1);
  }
  console.log(`RESULT: usable AI backends, in the order the Foreman tries them: ${usable.map((b) => b.id).join(" then ")}.`);
  if (doCall) {
    const facts = "Round 100: square 7 won. 3 players staked 120 CHIP; 10 CHIP was burned. The Foreman had 20 CHIP on squares 3 and 19 and lost it.";
    const remark = await new ForemanVoice(usable).remark(facts);
    console.log(remark ? `A real remark (${remark.via}, ${remark.model}${remark.powerRemaining === null ? "" : `, ${remark.powerRemaining} Power left`}): ${remark.text}` : "The AI answered, but nothing usable came back (empty, too long, or it added a number). Try again; if it keeps happening, tell the builder.");
  } else {
    console.log("Run `npm run ai:check -- --call` to ask for one real sentence.");
  }
}

main().catch((error) => {
  console.error("FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});

/**
 * Read-only check of the Kova testnet deployment. Needs no keys and sends no transactions.
 *
 *   npm ci && npm run verify:near
 *
 * Every line is PASS, FAIL or INFO with an explorer link. It reads the accounts in
 * docs/near/v3/testnet.json and docs/near/v3/foreman.json, asks one RPC and falls back to a second.
 * Exit code 1 if any line is FAIL.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const RPCS = [process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com", "https://near-testnet.drpc.org"];
const EXPLORER = "https://testnet.nearblocks.io";
const deployment = JSON.parse(readFileSync(resolve("docs/near/v3/testnet.json"), "utf8")) as {
  mineCodeHash: string;
  accounts: { chip: string; factory: string };
  mines: Record<string, string>;
};
const foreman = (JSON.parse(readFileSync(resolve("docs/near/v3/foreman.json"), "utf8")) as { foreman: string }).foreman;

let failed = 0;
const account = (id: string) => `${EXPLORER}/address/${id}`;
function line(kind: "PASS" | "FAIL" | "INFO", text: string, link: string) {
  if (kind === "FAIL") failed += 1;
  console.log(`${kind}  ${text}\n      ${link}`);
}

async function rpc<T>(params: Record<string, unknown>): Promise<T> {
  let last: unknown;
  for (const url of RPCS) {
    try {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { finality: "final", ...params } }) });
      const body = (await response.json()) as { result?: T & { error?: string }; error?: unknown };
      if (body.result && !body.result.error) return body.result;
      last = body.error ?? body.result?.error ?? `HTTP ${response.status}`;
    } catch (error) {
      last = error;
    }
  }
  throw new Error(`every RPC failed: ${last instanceof Error ? last.message : JSON.stringify(last)}`);
}

const view = async <T>(contract: string, method: string, args: object = {}): Promise<T> => {
  const out = await rpc<{ result: number[] }>({ request_type: "call_function", account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") });
  return JSON.parse(Buffer.from(out.result).toString()) as T;
};
type Key = { public_key: string; access_key: { permission: "FullAccess" | { FunctionCall: { receiver_id: string; method_names: string[] } } } };
const keys = async (id: string) => (await rpc<{ keys: Key[] }>({ request_type: "view_access_key_list", account_id: id })).keys;
const units = (v: string | bigint, decimals = 18) => {
  const n = BigInt(v);
  const whole = n / 10n ** BigInt(decimals);
  const frac = (n % 10n ** BigInt(decimals)).toString().padStart(decimals, "0").slice(0, 2).replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${frac ? `.${frac}` : ""}`;
};

type Summary = { round: string; outcome: string; winning_square: number | null; burned: string; winners: { award: string }[] };
type MineStats = { burned_by_burn: string; burned_by_transfer: string; rounds_settled: number; rounds_refunded: number };

async function main() {
  console.log(`Kova on NEAR testnet, read-only check. RPC: ${RPCS.join(", then ")}\n`);

  const factoryConfig = await view<{ mine_code_hash: string; allowed_tokens: string[] }>(deployment.accounts.factory, "get_config");
  line(factoryConfig.mine_code_hash === deployment.mineCodeHash ? "PASS" : "FAIL", `The factory opens mines from code hash ${factoryConfig.mine_code_hash} (testnet.json: ${deployment.mineCodeHash}).`, account(deployment.accounts.factory));
  line("INFO", `The factory accepts: ${factoryConfig.allowed_tokens.join(", ")}.`, account(deployment.accounts.factory));

  for (const [token, mine] of Object.entries(deployment.mines)) {
    const meta = await view<{ symbol: string; decimals: number }>(token, "ft_metadata");
    const mineKeys = await keys(mine);
    line(mineKeys.length === 0 ? "PASS" : "FAIL", `The ${meta.symbol} mine has ${mineKeys.length} access keys, so nobody can change it or move its coins.`, account(mine));
    const state = await rpc<{ code_hash: string; global_contract_hash?: string | null }>({ request_type: "view_account", account_id: mine });
    const runs = state.global_contract_hash ?? state.code_hash;
    line(runs === deployment.mineCodeHash ? "PASS" : "FAIL", `The ${meta.symbol} mine runs the published code ${runs}.`, account(mine));
    const stats = await view<MineStats>(mine, "get_stats");
    line("INFO", `${meta.symbol} burned by this mine: ${units(BigInt(stats.burned_by_burn) + BigInt(stats.burned_by_transfer), meta.decimals)} ${meta.symbol} (${stats.rounds_settled} rounds won, ${stats.rounds_refunded} refunded).`, account(mine));
    const recent = (await view<Summary[]>(mine, "get_recent", { limit: 12 })).filter((r) => r.outcome === "settled").slice(0, 3);
    for (const r of recent) {
      const paid = r.winners.reduce((n, w) => n + BigInt(w.award), 0n);
      line("INFO", `${meta.symbol} round ${r.round}: square ${(r.winning_square ?? 0) + 1} won, ${units(paid, meta.decimals)} paid to ${r.winners.length}, ${units(r.burned, meta.decimals)} burned.`, account(mine));
    }
  }

  const foremanKeys = await keys(foreman);
  const fullAccess = foremanKeys.filter((k) => k.access_key.permission === "FullAccess").length;
  line(fullAccess === 0 ? "PASS" : "FAIL", `The Foreman has ${foremanKeys.length} keys, ${fullAccess} with full access.`, account(foreman));
  for (const k of foremanKeys) {
    const p = k.access_key.permission;
    if (p !== "FullAccess") line("INFO", `Foreman key may call only ${p.FunctionCall.method_names.join(", ")} on ${p.FunctionCall.receiver_id}.`, account(foreman));
  }

  for (const id of [deployment.accounts.chip, deployment.accounts.factory]) {
    const list = await keys(id);
    const full = list.filter((k) => k.access_key.permission === "FullAccess").length;
    line(list.length === 0 ? "PASS" : "INFO", list.length === 0 ? `${id} has 0 access keys, so nobody can redeploy or change it.` : `${id} holds ${list.length} access keys (${full} full access), held by the team.`, account(id));
  }

  const chip = await view<{ total_supply: string; cap: string; total_minted: string; total_burned: string; starter_minted: string; emission_minted: string; motherlode_minted: string }>(deployment.accounts.chip, "get_stats");
  const earned = BigInt(chip.starter_minted) + BigInt(chip.emission_minted) + BigInt(chip.motherlode_minted);
  line(earned === BigInt(chip.total_minted) ? "PASS" : "FAIL", `CHIP minted ${units(chip.total_minted)}: starter claims ${units(chip.starter_minted)}, winners ${units(chip.emission_minted)}, the Hoard ${units(chip.motherlode_minted)}. Nothing else, so no premine.`, account(deployment.accounts.chip));
  line(BigInt(chip.total_supply) <= BigInt(chip.cap) ? "PASS" : "FAIL", `CHIP supply ${units(chip.total_supply)} of a cap of ${units(chip.cap)}; ${units(chip.total_burned)} burned.`, account(deployment.accounts.chip));

  console.log(failed ? `\n${failed} FAIL` : "\nAll checks passed.");
  process.exitCode = failed ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error(`FAIL  ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

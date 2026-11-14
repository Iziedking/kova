/* eslint-disable @typescript-eslint/no-explicit-any -- RPC outcomes and keys arrive as untyped JSON */
/**
 * Deploys Kova v3 to NEAR testnet, on NEW accounts under a funder account, and opens two mines.
 *
 *   PROVE_FUNDER_ACCOUNT=<account>.testnet PROVE_FUNDER_KEY_FILE=<path> npm run deploy:near-v3
 *
 * The key file holds one `ed25519:...` secret key and must live outside the repository. Needs about
 * 30 testnet NEAR on the funder: publishing the mine as a global contract burns 10 NEAR per 100 KB
 * (docs.near.org/smart-contracts/global-contracts), the rest is contract storage.
 *
 * What it does, one transaction each, every link printed:
 *   1. publishes near/mine as a global contract BY HASH (immutable) from the funder;
 *   2. creates `chip.<funder>`, `jambo.<funder>`, `factory.<funder>`, each deployed and initialised in
 *      the same transaction, so nobody can initialise them first;
 *   3. opens a mine for CHIP and one for JAMBO (a second coin, the same code as CHIP) through the
 *      factory. The mines are created by the factory, keyless, running the published hash.
 *
 * It never touches kova-chip.testnet or near/chip. Results go to docs/near/v3/testnet.json, which
 * holds addresses and hashes only, never keys.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, KeyPair, KeyPairSigner, actions } from "near-api-js";
import { NEAR_NETWORKS, nearProvider } from "../../src/adapters/near/chip";

const network = NEAR_NETWORKS.testnet;
const ONE = 10n ** 18n;
const NEAR = 10n ** 24n;
const OUT = resolve(process.cwd(), "docs/near/v3/testnet.json");
const WASM = {
  mine: resolve(process.cwd(), "near/mine/target/near/kova_mine.wasm"),
  factory: resolve(process.cwd(), "near/factory/target/near/kova_factory.wasm"),
  chip: resolve(process.cwd(), "near/chip-v3/target/near/kova_chip_v3.wasm"),
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const links: { what: string; url: string }[] = [];

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(bytes: Uint8Array): string {
  let n = BigInt("0x" + Buffer.from(bytes).toString("hex"));
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

function say(what: string, hash: string) {
  const url = network.explorerTx(hash);
  links.push({ what, url });
  console.log(`   ok  ${what}\n       ${url}`);
}

function failureOf(result: any): string | undefined {
  const status = result?.status;
  if (status && typeof status === "object" && "Failure" in status) return JSON.stringify(status.Failure);
  for (const o of result?.receipts_outcome ?? []) {
    const s = o.outcome?.status;
    if (s && typeof s === "object" && "Failure" in s) return JSON.stringify(s.Failure);
  }
  return undefined;
}

async function main() {
  const funderId = process.env.PROVE_FUNDER_ACCOUNT;
  const keyFile = process.env.PROVE_FUNDER_KEY_FILE;
  if (!funderId || !keyFile) throw new Error("Set PROVE_FUNDER_ACCOUNT and PROVE_FUNDER_KEY_FILE (a testnet account with about 30 NEAR).");
  if (!funderId.endsWith(".testnet")) throw new Error("This script only deploys to testnet.");
  if (existsSync(OUT)) throw new Error(`${OUT} exists: a v3 testnet deployment is already recorded. Remove it to deploy again.`);
  const provider = nearProvider(network);
  const funder = new Account(funderId, provider, new KeyPairSigner(KeyPair.fromString(readFileSync(keyFile, "utf8").trim() as any)));

  const code = Object.fromEntries(Object.entries(WASM).map(([k, p]) => [k, new Uint8Array(readFileSync(p))])) as Record<keyof typeof WASM, Uint8Array>;
  const sha = (b: Uint8Array) => createHash("sha256").update(b).digest();
  const mineHash = base58(sha(code.mine));
  console.log(`Kova v3 on NEAR testnet. Funder ${funderId}`);
  console.log(`mine wasm ${code.mine.length} bytes, hash ${mineHash}`);
  const balance = BigInt((await provider.viewAccount({ accountId: funderId })).amount);
  const burn = (BigInt(code.mine.length) * 10n * NEAR) / 100_000n;
  console.log(`funder balance ${Number(balance / 10n ** 20n) / 10_000} NEAR; global publish burns about ${Number(burn / 10n ** 20n) / 10_000} NEAR`);
  if (balance < burn + 8n * NEAR) throw new Error("The funder needs about 30 NEAR.");

  console.log("\n1. Publish the mine as a global contract, by hash");
  const published = await funder.deployGlobalContract(code.mine, "codeHash");
  if (failureOf(published)) throw new Error(`publish failed: ${failureOf(published)}`);
  say("publish mine (global, by hash)", published.transaction.hash);

  const keys: Record<string, KeyPair> = {};
  const accountOf = (name: string) => `${name}.${funderId}`;
  const metadata = (name: string, symbol: string) => ({ spec: "ft-1.0.0", name, symbol, decimals: 18 });
  const factoryId = accountOf("factory");
  const chipConfig = {
    factory: factoryId,
    cap: (21_000_000n * ONE).toString(),
    starter_amount: (1_000n * ONE).toString(),
    starter_budget: (100_000n * ONE).toString(),
    emission_per_minute: (10n * ONE).toString(),
    halving_seconds: 30 * 86_400,
    motherlode_per_round: (2n * ONE).toString(),
    motherlode_odds: 625,
    motherlode_cap: (5_000n * ONE).toString(),
  };

  /** Creates the account, funds it, deploys code and calls `new`: one transaction, so nobody can initialise first. */
  async function launch(name: string, wasm: Uint8Array, near: bigint, init: object) {
    const id = accountOf(name);
    const key = KeyPair.fromRandom("ed25519");
    keys[name] = key;
    const result = await funder.signAndSendTransaction({
      receiverId: id,
      actions: [
        actions.createAccount(),
        actions.transfer(near),
        actions.addFullAccessKey(key.getPublicKey()),
        actions.deployContract(wasm),
      ],
    });
    if (failureOf(result)) throw new Error(`${id} create+deploy failed: ${failureOf(result)}`);
    say(`create and deploy ${id}`, result.transaction.hash);
    const account = new Account(id, provider, new KeyPairSigner(key));
    const initResult = await account.signAndSendTransaction({
      receiverId: id,
      actions: [actions.functionCall("new", init as any, 100_000_000_000_000n, 0n)],
    });
    if (failureOf(initResult)) throw new Error(`${id}.new failed: ${failureOf(initResult)}`);
    say(`${id}.new`, initResult.transaction.hash);
    return account;
  }

  console.log("\n2. Create CHIP, a second coin and the factory");
  const chip = await launch("chip", code.chip, 26n * NEAR / 10n, { metadata: metadata("Kova Chip", "CHIP"), config: chipConfig });
  const jambo = await launch("jambo", code.chip, 26n * NEAR / 10n, { metadata: metadata("Jambo", "JAMBO"), config: chipConfig });
  const factory = await launch("factory", code.factory, 3n * NEAR, {
    mine_code_hash: mineHash,
    chip: chip.accountId,
    allowed_tokens: [chip.accountId, jambo.accountId],
    allowed_suffixes: [],
  });

  console.log("\n3. Open a mine for each coin through the factory");
  const mines: Record<string, string> = {};
  for (const token of [chip.accountId, jambo.accountId]) {
    let opened = false;
    for (let attempt = 0; attempt < 5 && !opened; attempt += 1) {
      const result = await funder.signAndSendTransaction({
        receiverId: factory.accountId,
        actions: [
          actions.functionCall(
            "open_mine",
            { token, min_stake: ONE.toString(), max_stake: (500n * ONE).toString(), vein_per_round: "0", vein_halving_days: 0 },
            300_000_000_000_000n,
            NEAR / 5n,
          ),
        ],
      });
      say(`open_mine(${token})`, result.transaction.hash);
      await sleep(4_000);
      const info = await provider.callFunction({ contractId: factory.accountId, method: "get_mine", args: { token } });
      if (info) {
        opened = true;
        mines[token] = (info as any).mine;
      } else {
        console.log("   the mine was not created (the global code may still be spreading); trying again");
        await sleep(8_000);
      }
    }
    if (!opened) throw new Error(`could not open a mine for ${token}`);
  }

  for (const [token, mine] of Object.entries(mines)) {
    const keysOnMine = await provider.viewAccessKeyList({ accountId: mine });
    const state = await provider.viewAccount({ accountId: mine });
    console.log(`   ${mine}: ${(keysOnMine as any).keys.length} access keys, code hash ${state.code_hash} (global: ${(state as any).global_contract_hash ?? "see explorer"})`);
    void token;
  }

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        network: "testnet",
        deployedAt: new Date().toISOString(),
        funder: funderId,
        mineCodeHash: mineHash,
        mineWasmBytes: code.mine.length,
        accounts: { chip: chip.accountId, jambo: jambo.accountId, factory: factory.accountId },
        mines,
        wasmSha256: Object.fromEntries(Object.entries(code).map(([k, b]) => [k, sha(b).toString("hex")])),
        links,
      },
      null,
      2,
    ) + "\n",
  );
  // The keys of chip, jambo and factory are written next to the funder's, outside the repository.
  const keyOut = keyFile.replace(/[^/]*$/, "");
  for (const [name, key] of Object.entries(keys)) writeFileSync(`${keyOut}${accountOf(name)}.key`, key.toString(), { mode: 0o600 });
  console.log(`\nRecorded ${OUT}. Keys for the three contract accounts are in ${keyOut} (outside the repo).`);
}

main().catch((error) => {
  console.error("\nFAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});

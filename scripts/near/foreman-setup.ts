/* eslint-disable @typescript-eslint/no-explicit-any -- RPC outcomes and keys arrive as untyped JSON */
/**
 * Creates the Foreman's account on testnet. It is created with two function-call keys and NO
 * full-access key, so nothing can ever sign as it except these:
 *   - the deploy key:  CHIP's `mine_deploy` and `claim_starter` only, no deposit (it can stake CHIP and nothing else);
 *   - the post key:    the social contract's `set` only, no deposit.
 * The funder owns the namespace the Foreman writes recaps under (`<funder>/kova/foreman/*`) and grants
 * the post key permission to write there (SocialDB: github.com/NearSocial/social-db, "Permissions").
 * The funder pays the storage; the Foreman writes into five fixed slots, so storage never grows.
 *
 *   FOREMAN_FUNDER_ACCOUNT=<acct>.testnet FOREMAN_FUNDER_KEY_FILE=<path> npm run foreman:setup
 *
 * Secret keys are written outside the repository (~/.kova-testnet). Addresses and public keys go to
 * docs/near/v3/foreman.json. Send NEAR to the Foreman afterwards with an ordinary transfer: it needs
 * about 0.09 NEAR free for each stake, and a few thousandths for each post.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Account, KeyPair, KeyPairSigner, actions } from "near-api-js";
import { NEAR_NETWORKS, nearProvider } from "../../src/adapters/near/chip";
import { GRID_CHIP, GRID_KEY_METHODS } from "../../src/adapters/near/grid";

export const SOCIAL_CONTRACT = "v1.social08.testnet";
const network = NEAR_NETWORKS.testnet;
const NEAR = 10n ** 24n;
const OUT = resolve(process.cwd(), "docs/near/v3/foreman.json");

async function main() {
  const funderId = process.env.FOREMAN_FUNDER_ACCOUNT;
  const keyFile = process.env.FOREMAN_FUNDER_KEY_FILE;
  if (!funderId || !keyFile) throw new Error("Set FOREMAN_FUNDER_ACCOUNT and FOREMAN_FUNDER_KEY_FILE.");
  if (existsSync(OUT)) throw new Error(`${OUT} exists: a Foreman is already recorded. Remove it to create another.`);
  const provider = nearProvider(network);
  const funder = new Account(funderId, provider, new KeyPairSigner(KeyPair.fromString(readFileSync(keyFile, "utf8").trim() as any)));
  const foremanId = `foreman.${funderId}`;
  const deployKey = KeyPair.fromRandom("ed25519");
  const postKey = KeyPair.fromRandom("ed25519");
  const keyDir = `${homedir()}/.kova-testnet`;
  mkdirSync(keyDir, { recursive: true });
  writeFileSync(`${keyDir}/${foremanId}.deploykey`, deployKey.toString(), { mode: 0o600 });
  writeFileSync(`${keyDir}/${foremanId}.postkey`, postKey.toString(), { mode: 0o600 });

  console.log(`1. Create ${foremanId} with two function-call keys and no full-access key`);
  const created = await funder.signAndSendTransaction({
    receiverId: foremanId,
    actions: [
      actions.createAccount(),
      actions.transfer(NEAR / 100n),
      actions.addFunctionCallAccessKey(deployKey.getPublicKey(), GRID_CHIP, [...GRID_KEY_METHODS], 250_000_000_000_000_000_000_000n),
      actions.addFunctionCallAccessKey(postKey.getPublicKey(), SOCIAL_CONTRACT, ["set"], 100_000_000_000_000_000_000_000n),
    ],
  });
  console.log(`   ok  ${network.explorerTx(created.transaction.hash)}`);

  console.log(`2. ${funderId} lets the post key write under ${funderId}/kova/foreman (it pays the storage)`);
  const grant = await funder.signAndSendTransaction({
    receiverId: SOCIAL_CONTRACT,
    actions: [actions.functionCall("grant_write_permission", { public_key: postKey.getPublicKey().toString(), keys: [`${funderId}/kova/foreman`] }, 30_000_000_000_000n, NEAR / 50n)],
  });
  const failed = JSON.stringify(grant.status).includes("Failure") || (grant.receipts_outcome ?? []).some((o: any) => JSON.stringify(o.outcome.status).includes("Failure"));
  if (failed) throw new Error(`grant failed: ${JSON.stringify(grant.status).slice(0, 300)}`);
  console.log(`   ok  ${network.explorerTx(grant.transaction.hash)}`);

  const keys = ((await provider.viewAccessKeyList({ accountId: foremanId })) as any).keys as { public_key: string; access_key: { permission: any } }[];
  const summary = keys.map((k) => ({ publicKey: k.public_key, permission: k.access_key.permission === "FullAccess" ? "FullAccess" : { receiver: k.access_key.permission.FunctionCall.receiver_id, methods: k.access_key.permission.FunctionCall.method_names } }));
  if (summary.some((k) => k.permission === "FullAccess")) throw new Error("the Foreman has a full-access key");
  writeFileSync(
    OUT,
    JSON.stringify({ network: "testnet", createdAt: new Date().toISOString(), foreman: foremanId, namespaceOwner: funderId, namespace: `${funderId}/kova/foreman`, social: SOCIAL_CONTRACT, chip: GRID_CHIP, keys: summary, links: [{ what: "create the Foreman", url: network.explorerTx(created.transaction.hash) }, { what: "grant the post key", url: network.explorerTx(grant.transaction.hash) }] }, null, 2) + "\n",
  );
  console.log(`\nDone. ${foremanId} has ${summary.length} keys, none full access. Recorded ${OUT}. Secret keys are in ${keyDir}.`);
}

main().catch((error) => {
  console.error("\nFAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});

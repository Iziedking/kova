/* eslint-disable @typescript-eslint/no-explicit-any -- RPC outcomes and keys arrive as untyped JSON */
/**
 * Proves the registration step on a real standard token (NEP-145), with the same call builder the
 * Open-a-mine page uses: an account that is not registered with the token becomes registered, and
 * the token keeps exactly its minimum.
 *
 *   REGISTER_FUNDER_ACCOUNT=<acct>.testnet REGISTER_FUNDER_KEY_FILE=<path> [REGISTER_TOKEN=wrap.testnet] npm run prove:near-register
 *
 * It registers a throwaway account id that has never existed (NEP-145 does not require the account
 * to exist), which is also the position a freshly opened mine is in. About 0.0013 NEAR is spent.
 */
import { readFileSync } from "node:fs";
import { Account, KeyPair, KeyPairSigner, actions } from "near-api-js";
import { NEAR_NETWORKS, nearProvider } from "../../src/adapters/near/chip";
import { GridClient, formatUnits, needsRegistration, registrationCall } from "../../src/adapters/near/grid";

const network = NEAR_NETWORKS.testnet;

function check(ok: boolean, message: string) {
  console.log(`   ${ok ? "ok  " : "FAIL"} ${message}`);
  if (!ok) throw new Error(`check failed: ${message}`);
}

async function main() {
  const funderId = process.env.REGISTER_FUNDER_ACCOUNT;
  const keyFile = process.env.REGISTER_FUNDER_KEY_FILE;
  if (!funderId || !keyFile) throw new Error("Set REGISTER_FUNDER_ACCOUNT and REGISTER_FUNDER_KEY_FILE.");
  const token = process.env.REGISTER_TOKEN ?? "wrap.testnet";
  const provider = nearProvider(network);
  const grid = new GridClient(network, provider);
  const funder = new Account(funderId, provider, new KeyPairSigner(KeyPair.fromString(readFileSync(keyFile, "utf8").trim() as any)));
  const probe = `kova-reg-probe-${Date.now().toString(36)}.testnet`;

  console.log(`Registering ${probe} with ${token}`);
  const before = await grid.storageBalance(token, probe);
  check(before === "unregistered" && needsRegistration(before), "before: the token reports it as not registered");
  const min = await grid.registrationCost(token);
  check(min !== null && min > 0n, `the token's registration cost is ${min === null ? "?" : formatUnits(min, 24, 5)} NEAR`);
  const funds = BigInt(((await provider.viewAccount({ accountId: funderId })) as any).amount);

  const call = registrationCall({ token, mine: probe, min: min! });
  const sent: any = await funder.signAndSendTransaction({ receiverId: call.contractId, actions: [actions.functionCall(call.method, call.args, call.gas, call.deposit)], throwOnFailure: false });
  console.log(`   tx ${network.explorerTx(sent.transaction.hash)}`);
  check(!JSON.stringify(sent.status).includes("Failure"), "the storage_deposit succeeded");
  await new Promise((r) => setTimeout(r, 3_000));

  const after = await grid.storageBalance(token, probe);
  check(typeof after === "object" && !needsRegistration(after), "after: the token reports it as registered");
  if (typeof after === "object") check(after.total === min, `the token kept exactly its minimum (${formatUnits(after.total, 24, 5)} NEAR)`);
  const spent = funds - BigInt(((await provider.viewAccount({ accountId: funderId })) as any).amount);
  check(spent < min! + 5n * 10n ** 21n, `the caller paid the minimum plus gas, no more (${formatUnits(spent, 24, 5)} NEAR)`);
  console.log("\nPASS.");
}

main().catch((error) => {
  console.error("\nFAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});

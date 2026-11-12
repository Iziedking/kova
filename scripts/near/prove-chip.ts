/**
 * Plays CHIP end to end on NEAR testnet from the terminal, with throwaway accounts, and prints
 * every step with its explorer link. Needs no keys from Kova.
 *
 *   npm run prove:near
 *
 * 1. Gets one funded account from the testnet faucet and creates sub-accounts under it:
 *    a contract, a settler and three players.
 * 2. Deploys its own copy of CHIP (near/chip/res/kova_chip.wasm) with the throwaway settler.
 *    This copy uses 60-second blind timing so blinds show inside one run. The live contract
 *    uses the simulated parameters (docs/near/chip-simulation.json).
 * 3. Starter claims, one full table, its settlement and the pot burn.
 * 4. A table that never fills, refunded by a third account.
 * 5. A blind collected from an idle holder.
 * 6. The daily call: closes a finished day on the live contract (anyone may), if one is open.
 *
 * The settler here reports fixed proof prices, not market data. In the app the settler is
 * Kova's worker and the prices come from DEX Screener and GeckoTerminal.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner } from "near-api-js";
import { CHIP, ChipClient, type ChipCallResult, NEAR_NETWORKS, PRICE_ONE, failureMessage, formatChip, newSalt, pickCommitment } from "../../src/adapters/near/chip";

const network = NEAR_NETWORKS.testnet;
const FAUCET = "https://helper.nearprotocol.com/account";
const LIVE_CONTRACT = process.env.CHIP_LIVE_CONTRACT ?? "chip.kingizie.testnet";
const WASM = resolve(process.cwd(), "near/chip/res/kova_chip.wasm");
const YOCTO = 10n ** 24n;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let step = 0;
const links: { what: string; url: string }[] = [];

function heading(text: string) {
  step += 1;
  console.log(`\n${step}. ${text}`);
}

function record(what: string, result: ChipCallResult) {
  if (!result.success) throw new Error(`${what} failed: ${result.failure} (${result.explorerUrl})`);
  links.push({ what, url: result.explorerUrl });
  console.log(`   ok  ${what}\n       ${result.explorerUrl}`);
  return result;
}

/** RPC nodes behind a load balancer can lag a block behind a write. Read until the table shows up. */
async function tableAfterWrite(client: ChipClient, id: string) {
  for (let i = 0; i < 10; i += 1) {
    const table = await client.getTable(id);
    if (table) return table;
    await sleep(1_000);
  }
  throw new Error(`Table ${id} did not appear on the RPC.`);
}

async function faucetAccount(): Promise<{ id: string; key: KeyPair }> {
  const key = KeyPair.fromRandom("ed25519");
  const id = `kova-proof-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}.testnet`;
  const response = await fetch(FAUCET, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ newAccountId: id, newAccountPublicKey: key.getPublicKey().toString() }),
  });
  if (!response.ok) throw new Error(`Faucet refused (${response.status}): ${await response.text()}`);
  return { id, key };
}

async function main() {
  const wasm = readFileSync(WASM);
  console.log(`CHIP proof on NEAR testnet. Contract wasm sha256 ${createHash("sha256").update(wasm).digest("hex")}`);

  heading("Create throwaway accounts");
  const root = await faucetAccount();
  console.log(`   faucet funded ${root.id}  ${network.explorerAccount(root.id)}`);
  const provider = new JsonRpcProvider({ url: network.rpcUrl });
  const rootAccount = new Account(root.id, provider, new KeyPairSigner(root.key));
  for (let i = 0; i < 20; i += 1) {
    try {
      await provider.viewAccount({ accountId: root.id });
      break;
    } catch {
      await sleep(1_500);
    }
  }
  const names = ["chip", "settler", "alice", "bob", "carol"] as const;
  const accounts = {} as Record<(typeof names)[number], Account>;
  for (const name of names) {
    const key = KeyPair.fromRandom("ed25519");
    const id = `${name}.${root.id}`;
    // A faucet account holds about 6 NEAR. The 293 KB contract needs about 2.93 NEAR of storage.
    const near = name === "chip" ? (36n * YOCTO) / 10n : (4n * YOCTO) / 10n;
    const tx = await rootAccount.createSubAccount({ accountOrPrefix: id, publicKey: key.getPublicKey(), nearToTransfer: near });
    accounts[name] = new Account(id, provider, new KeyPairSigner(key));
    console.log(`   created ${id}  ${network.explorerTx(tx.transaction.hash)}`);
  }
  const { chip: contract, settler, alice, bob, carol } = accounts;

  heading("Deploy CHIP and set its rules once");
  const deploy = await contract.deployContract(new Uint8Array(wasm));
  links.push({ what: "deploy", url: network.explorerTx(deploy.transaction.hash) });
  console.log(`   deployed  ${network.explorerTx(deploy.transaction.hash)}`);
  const client = new ChipClient(contract.accountId, network, provider);
  const initArgs = {
      metadata: { spec: "ft-1.0.0", name: "Kova Chip", symbol: "CHIP", decimals: 18 },
      config: {
        settler: settler.accountId,
        starter_amount: (1_000n * CHIP).toString(),
        min_stake: CHIP.toString(),
        max_stake: (1_000n * CHIP).toString(),
        pot_burn_bps: 1000,
        daily_target_tables: 30,
        daily_mint: (2_000n * CHIP).toString(),
        daily_miss_burn_bps: 100,
        blind_grace_seconds: 60,
        blind_period_seconds: 60,
        blind_bps: 100,
        blind_floor: (100n * CHIP).toString(),
      },
      treasury_supply: (1_000_000n * CHIP).toString(),
      house_account: bob.accountId,
      house_bankroll: "0",
  };
  record("init (no owner, no setters)", await client.call(contract, "new", initArgs));
  // The same, valid arguments again: refused because the contract is already set up.
  const again = await client.call(contract, "new", initArgs);
  console.log(`   refused  a second init with valid arguments: ${again.success ? "NOT REFUSED" : failureMessage(again.failure)}`);
  if (again.success) throw new Error("A second init succeeded.");
  links.push({ what: "second init refused", url: again.explorerUrl });

  heading("Starter claims");
  for (const player of [alice, bob, carol]) record(`starter claim by ${player.accountId}`, await client.claimStarter(player));
  const repeat = await client.claimStarter(alice);
  console.log(`   refused  a second starter claim: ${repeat.success ? "NOT REFUSED" : failureMessage(repeat.failure)}`);
  if (repeat.success) throw new Error("A second starter claim succeeded.");
  const supplyBefore = (await client.getStats()).total_supply;
  console.log(`   supply ${formatChip(supplyBefore)} CHIP`);

  heading("One full table: alice opens, bob joins");
  const picks = { alice: { market: "near:blackdragon.tkn.near", salt: newSalt() }, bob: { market: "near:token.lonkingnearbackto2024.near", salt: newSalt() } };
  const stake = 25n * CHIP;
  const opened = record(
    "open table (alice stakes 25 CHIP)",
    await client.openTable(alice, { stake, seats: 2, roundSeconds: 30, openSeconds: 120, commitment: await pickCommitment(alice.accountId, picks.alice.market, picks.alice.salt) }),
  );
  const tableId = String(opened.value);
  record("join table (bob stakes 25 CHIP)", await client.joinTable(bob, tableId, await pickCommitment(bob.accountId, picks.bob.market, picks.bob.salt)));
  console.log(`   table ${tableId} is ${(await tableAfterWrite(client, tableId)).status}`);

  heading("Settler reveals the picks with start prices (proof prices, not market data)");
  const notSettler = await client.startRound(carol, tableId, []);
  console.log(`   refused  a reveal by a non-settler: ${notSettler.success ? "NOT REFUSED" : failureMessage(notSettler.failure)}`);
  if (notSettler.success) throw new Error("A non-settler revealed picks.");
  record(
    "start round",
    await client.startRound(settler, tableId, [
      { player: alice.accountId, ...picks.alice, startPrice: PRICE_ONE },
      { player: bob.accountId, ...picks.bob, startPrice: PRICE_ONE },
    ]),
  );

  heading("Round ends, settler reports end prices, the pot burns");
  const table = await tableAfterWrite(client, tableId);
  await sleep(Math.max(0, (table.ends_at + 2) * 1000 - Date.now()));
  const aliceBefore = await client.balanceOf(alice.accountId);
  let settled: ChipCallResult | undefined;
  for (let i = 0; i < 15; i += 1) {
    const result = await client.settleRound(settler, tableId, [
      { player: alice.accountId, endPrice: (PRICE_ONE * 12n) / 10n },
      { player: bob.accountId, endPrice: (PRICE_ONE * 9n) / 10n },
    ]);
    if (result.success) {
      settled = result;
      break;
    }
    if (!result.failure?.includes("Round is still running")) throw new Error(`settle failed: ${result.failure}`);
    await sleep(3_000);
  }
  record("settle round", settled!);
  const burn = (await client.getTable(tableId))!.burned;
  const supplyAfter = (await client.getStats()).total_supply;
  console.log(`   alice won ${formatChip((await client.balanceOf(alice.accountId)) - aliceBefore)} CHIP`);
  console.log(`   this pot burned ${formatChip(burn)} CHIP. Supply ${formatChip(supplyBefore)} -> ${formatChip(supplyAfter)}`);
  if (supplyBefore - supplyAfter !== burn) throw new Error("Supply did not fall by exactly the burn.");

  heading("A table that never fills is refunded by a third account");
  const lonely = record(
    "open 3-seat table (alice stakes 5 CHIP)",
    await client.openTable(alice, { stake: 5n * CHIP, seats: 3, roundSeconds: 30, openSeconds: 30, commitment: await pickCommitment(alice.accountId, "near:x", newSalt()) }),
  );
  const lonelyId = String(lonely.value);
  const lonelyTable = await tableAfterWrite(client, lonelyId);
  await sleep(Math.max(0, (lonelyTable.open_until + 2) * 1000 - Date.now()));
  const before = await client.balanceOf(alice.accountId);
  let voided: ChipCallResult | undefined;
  for (let i = 0; i < 10 && !voided?.success; i += 1) {
    voided = await client.voidTable(carol, lonelyId);
    if (!voided.success) await sleep(3_000);
  }
  record("void by carol (a third account)", voided!);
  console.log(`   alice refunded ${formatChip((await client.balanceOf(alice.accountId)) - before)} CHIP, table ${(await client.getTable(lonelyId))?.status}`);

  heading("Blinds: carol has not played, so she pays a blind to the treasury");
  const carolHolder = await client.getHolder(carol.accountId);
  const idleUntil = (carolHolder.last_play + 125) * 1000;
  await sleep(Math.max(0, idleUntil - Date.now()));
  const pending = (await client.getHolder(carol.accountId)).pending_blind;
  const collected = record("collect blinds from carol (called by bob)", await client.collectBlinds(bob, carol.accountId));
  console.log(`   carol paid ${formatChip(BigInt(String(collected.value)))} CHIP (owed ${formatChip(pending)}). Treasury now ${formatChip((await client.getStats()).treasury)}`);

  heading(`The daily call on the live contract ${LIVE_CONTRACT}`);
  try {
    const live = new ChipClient(LIVE_CONTRACT, network);
    const stats = await live.getStats();
    let closedOne = false;
    for (let day = stats.today - 1; day >= stats.launch_day && day >= stats.today - 3; day -= 1) {
      const state = await live.getDay(day);
      if (state.closed) continue;
      const result = await live.closeDay(carol, day);
      record(`close day ${day} on the live contract`, result);
      const after = await live.getDay(day);
      console.log(after.target_met ? `   target met: each player can claim ${formatChip(after.share)} CHIP` : `   target missed (${after.settled_tables}/${stats.daily_target_tables} tables): ${formatChip(after.burned)} CHIP of treasury burned`);
      closedOne = true;
      break;
    }
    if (!closedOne) console.log(`   no finished day is open on the live contract (today is day ${stats.today}, launch day ${stats.launch_day}). Closed days are shown on the token page.`);
  } catch (error) {
    console.log(`   skipped: live contract not reachable (${(error as Error).message})`);
  }

  console.log("\nExplorer links:");
  for (const link of links) console.log(`  ${link.what.padEnd(46)} ${link.url}`);
  console.log(`\nContract: ${network.explorerAccount(contract.accountId)}`);
}

main().catch((error) => {
  console.error(`\nPROOF FAILED: ${(error as Error).message}`);
  process.exitCode = 1;
});

/* eslint-disable @typescript-eslint/no-explicit-any -- RPC outcomes and keys arrive as untyped JSON */
/**
 * The brief's Phase 3 test, at the chain level: a brand-new account approves once, claims CHIP, and
 * mines three rounds, and every transaction after the one approval is signed by a game key that can
 * only call CHIP's `mine_deploy` and `claim_starter`. This is exactly what the site does for a
 * signed-in player (src/features/near/near-session.tsx, `enableGridKey`), minus Privy or a wallet
 * extension, which a script cannot drive.
 *
 *   PROVE_FUNDER_ACCOUNT=<acct> PROVE_FUNDER_KEY_FILE=<path> KEEPER_ACCOUNT=<acct> KEEPER_KEY_FILE=<path> npm run prove:near-user
 *
 * The funder creates the new account (0.14 NEAR). The keeper settles rounds (a settle reserves
 * 0.15 NEAR, returned except what it burns). They can be the same account if it holds enough.
 * Checks that must hold, or the script fails:
 *  - the new account's only access keys are its own and the one game key;
 *  - every transaction after the approval carries the game key's public key;
 *  - the game key is refused when it tries to attach a deposit, call another method, or call another contract;
 *  - the CHIP balance at the end is exactly 1,000, less what was staked, plus what each round returned,
 *    plus the emission a winning round mints to its winners (10 CHIP a round at today's rate). Stakes
 *    and returns are read from the mine's own round records, not from transaction logs.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Account, KeyPair, KeyPairSigner, actions } from "near-api-js";
import { NEAR_NETWORKS, nearProvider } from "../../src/adapters/near/chip";
import { GAS, GRID_CHIP, GRID_KEY_METHODS, GridClient, formatUnits, roundOf, stakeCall } from "../../src/adapters/near/grid";
import { settleDue } from "./keeper";

const network = NEAR_NETWORKS.testnet;
const ONE = 10n ** 18n;
const NEAR = 10n ** 24n;
const ROUNDS = 3;
const SQUARES_PER_ROUND = 2;
const STAKE = 10n * ONE;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const links: { what: string; url: string }[] = [];

function account(provider: any, idEnv: string, fileEnv: string): Account {
  const id = process.env[idEnv];
  const file = process.env[fileEnv];
  if (!id || !file) throw new Error(`Set ${idEnv} and ${fileEnv}.`);
  return new Account(id, provider, new KeyPairSigner(KeyPair.fromString(readFileSync(file, "utf8").trim() as any)));
}

function failed(outcome: any): string | undefined {
  const bad = (s: any) => s && typeof s === "object" && "Failure" in s;
  if (bad(outcome?.status)) return JSON.stringify(outcome.status.Failure);
  for (const o of outcome?.receipts_outcome ?? []) if (bad(o.outcome?.status)) return JSON.stringify(o.outcome.status.Failure);
  return undefined;
}

const eventsOf = (outcome: any) =>
  [...(outcome.transaction_outcome?.outcome.logs ?? []), ...(outcome.receipts_outcome ?? []).flatMap((r: any) => r.outcome.logs)]
    .filter((l: string) => l.startsWith("EVENT_JSON:"))
    .map((l: string) => JSON.parse(l.slice("EVENT_JSON:".length)));

function check(ok: boolean, message: string) {
  console.log(`   ${ok ? "ok  " : "FAIL"} ${message}`);
  if (!ok) throw new Error(`check failed: ${message}`);
}

async function main() {
  const provider = nearProvider(network);
  const grid = new GridClient(network, provider);
  const funder = account(provider, "PROVE_FUNDER_ACCOUNT", "PROVE_FUNDER_KEY_FILE");
  const keeper = account(provider, "KEEPER_ACCOUNT", "KEEPER_KEY_FILE");
  const chipMine = (await grid.mineFor(GRID_CHIP))?.mine;
  if (!chipMine) throw new Error("CHIP has no mine on this factory.");

  console.log("1. A new account, as an email or wallet sign-in would make");
  const owner = KeyPair.fromRandom("ed25519");
  const userId = `u${Date.now().toString(36)}.${funder.accountId}`;
  const keyDir = `${homedir()}/.kova-testnet`;
  if (existsSync(keyDir)) writeFileSync(`${keyDir}/${userId}.key`, owner.toString(), { mode: 0o600 }); // outside the repo, so leftover NEAR can be recovered
  const created = await funder.signAndSendTransaction({ receiverId: userId, actions: [actions.createAccount(), actions.transfer((14n * NEAR) / 100n), actions.addFullAccessKey(owner.getPublicKey())] });
  if (failed(created)) throw new Error(`create failed: ${failed(created)}`);
  links.push({ what: `create ${userId}`, url: network.explorerTx(created.transaction.hash) });
  console.log(`   ${userId}  ${network.explorerAccount(userId)}`);
  for (let i = 0; i < 20; i += 1) {
    try {
      await provider.viewAccount({ accountId: userId });
      break;
    } catch {
      await sleep(1_500);
    }
  }

  console.log("\n2. The one approval: add the game key (CHIP's mine_deploy and claim_starter, no more)");
  const gameKey = KeyPair.fromRandom("ed25519");
  const approval = await new Account(userId, provider, new KeyPairSigner(owner)).signAndSendTransaction({
    receiverId: userId,
    actions: [actions.addFunctionCallAccessKey(gameKey.getPublicKey(), GRID_CHIP, [...GRID_KEY_METHODS], 250_000_000_000_000_000_000_000n)],
  });
  if (failed(approval)) throw new Error(`approval failed: ${failed(approval)}`);
  links.push({ what: "the one approval (add game key)", url: network.explorerTx(approval.transaction.hash) });
  console.log(`   ok  ${network.explorerTx(approval.transaction.hash)}`);
  await sleep(2_000);
  const keys = ((await provider.viewAccessKeyList({ accountId: userId })) as any).keys as { public_key: string; access_key: { permission: any } }[];
  check(keys.length === 2, "the account has exactly two access keys: its own and the game key");
  const fc = keys.find((k) => k.public_key === gameKey.getPublicKey().toString())?.access_key.permission.FunctionCall;
  check(fc?.receiver_id === GRID_CHIP && JSON.stringify(fc.method_names) === JSON.stringify([...GRID_KEY_METHODS]), `the game key can only call ${GRID_KEY_METHODS.join(" and ")} on ${GRID_CHIP}`);

  // From here on the owner key is never used again: only the game key signs.
  const player = new Account(userId, provider, new KeyPairSigner(gameKey));
  const gameKeyText = gameKey.getPublicKey().toString();
  const signedByGameKey: string[] = [];

  console.log("\n3. Claim the starter CHIP with the game key (no popup)");
  const claim = await player.signAndSendTransaction({ receiverId: GRID_CHIP, actions: [actions.functionCall("claim_starter", {}, GAS.claimStarter, 0n)], throwOnFailure: false });
  check(!failed(claim) && (await grid.balance(GRID_CHIP, userId)) === 1_000n * ONE, "the account now holds 1,000 CHIP");
  signedByGameKey.push(claim.transaction.public_key);
  links.push({ what: "claim 1,000 CHIP", url: network.explorerTx(claim.transaction.hash) });

  console.log("\n4. What the game key must refuse");
  const refusals: [string, () => Promise<unknown>][] = [
    ["attaching a deposit (so it can never send NEAR or CHIP)", () => player.signAndSendTransaction({ receiverId: GRID_CHIP, actions: [actions.functionCall("mine_deploy", {}, GAS.mineDeploy, 1n)] })],
    ["calling another method on CHIP (ft_burn)", () => player.signAndSendTransaction({ receiverId: GRID_CHIP, actions: [actions.functionCall("ft_burn", { amount: "1" }, GAS.claimStarter, 0n)] })],
    ["calling another contract", () => player.signAndSendTransaction({ receiverId: chipMine, actions: [actions.functionCall("settle", { round: "1" }, GAS.claimStarter, 0n)] })],
  ];
  for (const [what, run] of refusals) {
    let refused = false;
    try {
      await run();
    } catch {
      refused = true;
    }
    check(refused, `refused: ${what}`);
  }

  console.log(`\n5. Mine ${ROUNDS} rounds with the game key`);
  let pending: number | undefined;
  const first = roundOf(Math.floor(Date.now() / 1000)) + 1;
  let staked = 0n;
  const rows: { round: number; staked: string; outcome: string }[] = [];
  for (let k = 0; k <= ROUNDS; k += 1) {
    const round = first + k;
    while (roundOf(Math.floor(Date.now() / 1000)) < round) await sleep(500);
    console.log(`-- round ${round}`);
    const tasks: Promise<void>[] = [];
    if (pending !== undefined) {
      const settling = pending;
      tasks.push(
        (async () => {
          const settled = await settleDue(keeper, grid, (line) => console.log(`   ${line}`));
          for (const s of settled.filter((x) => x.mine === chipMine && x.round === settling)) {
            links.push({ what: `${s.kind} round ${s.round}`, url: s.url });
            const row = rows.find((r) => r.round === s.round)!;
            row.outcome = s.kind;
            const result = s.events.find((e) => e.event === "round_settled");
            const winner = result ? (result.data[0] as any).winners.find((w: any) => w.player === userId) : undefined;
            if (winner) console.log(`   you won round ${s.round}: ${formatUnits(BigInt(winner.award), 18)} CHIP`);
          }
        })(),
      );
    }
    if (k < ROUNDS) {
      const row = { round, staked: "0", outcome: "pending" };
      rows.push(row);
      tasks.push(
        (async () => {
          const squares = new Set<number>();
          while (squares.size < SQUARES_PER_ROUND) squares.add(Math.floor(Math.random() * 25));
          for (const square of squares) {
            const call = stakeCall({ token: GRID_CHIP, mine: chipMine, square, units: STAKE, round });
            const r = await player.signAndSendTransaction({ receiverId: call.contractId, actions: [actions.functionCall(call.method, call.args, call.gas, call.deposit)], throwOnFailure: false });
            signedByGameKey.push(r.transaction.public_key);
            const ok = !failed(r) && eventsOf(r).some((e: any) => e.event === "staked");
            if (ok) {
              staked += STAKE;
              row.staked = (BigInt(row.staked) + STAKE).toString();
            }
            console.log(`   ${ok ? "staked" : "NOT staked"} ${formatUnits(STAKE, 18)} CHIP on square ${square + 1} ${network.explorerTx(r.transaction.hash)}`);
            links.push({ what: `stake round ${round} square ${square + 1}`, url: network.explorerTx(r.transaction.hash) });
          }
        })(),
      );
    }
    await Promise.all(tasks);
    pending = k < ROUNDS ? round : undefined;
  }

  console.log("\n6. Checks");
  check(signedByGameKey.length > 0 && signedByGameKey.every((k) => k === gameKeyText), `all ${signedByGameKey.length} transactions after the approval were signed by the game key`);
  check(rows.every((r) => r.outcome === "settled" || r.outcome === "refunded"), "every round was settled or refunded");
  await sleep(4_000);
  // What each round held and returned comes from the mine's own records. The account is the only
  // player in its rounds, so a round's total is exactly what it staked.
  const records = await grid.recent(chipMine, 24);
  let returned = 0n;
  let wins = 0;
  staked = 0n;
  for (const row of rows) {
    const record = records.find((r) => r.round === row.round);
    if (!record) {
      check(row.staked === "0", `round ${row.round} had no stakes, so it has no record`);
      continue;
    }
    check(record.players === 1, `round ${row.round}: the account was the only player (${record.players}), so its stake is the round's total`);
    staked += record.total;
    const winner = record.winners.find((w) => w.player === userId);
    returned += record.outcome === "refunded" ? record.total : (winner?.award ?? 0n);
    if (winner) wins += 1;
    if (BigInt(row.staked) !== record.total) console.log(`   note: round ${row.round}: the logs counted ${formatUnits(BigInt(row.staked), 18)} staked, the mine recorded ${formatUnits(record.total, 18)} (an RPC returned before every receipt ran)`);
  }
  check(staked > 0n, `${formatUnits(staked, 18)} CHIP was staked over ${ROUNDS} rounds`);
  const rate = (await grid.chipStats()).emission_rate;
  const emission = rate * BigInt(wins);
  const finalBalance = await grid.balance(GRID_CHIP, userId);
  const expected = 1_000n * ONE - staked + returned + emission;
  check(finalBalance === expected, `final CHIP ${formatUnits(finalBalance, 18)} = 1,000 - ${formatUnits(staked, 18)} staked + ${formatUnits(returned, 18)} returned + ${formatUnits(emission, 18)} emission (${wins} round${wins === 1 ? "" : "s"} won)`);

  writeFileSync(
    resolve(process.cwd(), "docs/near/v3/proof-grid-user.json"),
    JSON.stringify({ ranAt: new Date().toISOString(), account: userId, rounds: rows, staked: staked.toString(), finalBalance: finalBalance.toString(), transactionsSignedByGameKey: signedByGameKey.length, links }, null, 2) + "\n",
  );
  console.log(`\nPASS. ${userId} approved once and mined ${ROUNDS} rounds with no further approval. Saved docs/near/v3/proof-grid-user.json`);
}

main().catch((error) => {
  console.error("\nFAILED:", error instanceof Error ? error.message : error);
  if (error instanceof Error) console.error(error.stack);
  process.exit(1);
});

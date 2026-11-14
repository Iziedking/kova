/* eslint-disable @typescript-eslint/no-explicit-any -- RPC outcomes and keys arrive as untyped JSON */
/**
 * The Foreman: an account that mines next to you and posts what happened, so each round's recap can
 * be checked on chain. Run it with the keeper (npm run keeper:near) so rounds get settled.
 *
 *   FOREMAN_ROUNDS=10 npm run foreman:near
 *
 * Every round it backs two squares with 10 CHIP each (picked by a hash anyone can recompute, see
 * src/adapters/near/foreman.ts), then, once the previous round has a result, writes a recap into one
 * of five fixed social-contract slots under <owner>/kova/foreman. The post is a template filled from
 * the mine's own round record, labelled `by: "rule"`. No AI wrote it: there is no NEAR AI or BRRRAIN
 * key behind this runner. It stops by itself if it runs low on NEAR or CHIP, or after FOREMAN_ROUNDS.
 *
 * Its keys: the deploy key (CHIP mine_deploy and claim_starter) and the post key (social `set`),
 * created by foreman:setup, read from ~/.kova-testnet. Neither can move NEAR or CHIP.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Account, KeyPair, KeyPairSigner, actions } from "near-api-js";
import { NEAR_NETWORKS, nearProvider, parseEvents } from "../../src/adapters/near/chip";
import { FOREMAN_STAKE_COINS, composeRecap, feedLeaf, feedSlot, pickSquares, stopReason, type ForemanStake } from "../../src/adapters/near/foreman";
import { GAS, GRID_CHIP, GridClient, formatUnits, stakeCall } from "../../src/adapters/near/grid";

const network = NEAR_NETWORKS.testnet;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const config = JSON.parse(readFileSync(resolve(process.cwd(), "docs/near/v3/foreman.json"), "utf8")) as { foreman: string; namespaceOwner: string; social: string };
const ROUNDS = Number(process.env.FOREMAN_ROUNDS ?? 10);

const roundNow = () => Math.floor(Date.now() / 60_000);
const log = (line: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);
const keyFrom = (suffix: string) => KeyPair.fromString(readFileSync(`${homedir()}/.kova-testnet/${config.foreman}.${suffix}`, "utf8").trim() as any);

async function main() {
  const provider = nearProvider(network);
  const grid = new GridClient(network, provider);
  const deployer = new Account(config.foreman, provider, new KeyPairSigner(keyFrom("deploykey")));
  const poster = new Account(config.foreman, provider, new KeyPairSigner(keyFrom("postkey")));
  const mine = (await grid.mineFor(GRID_CHIP))?.mine;
  if (!mine) throw new Error("CHIP has no mine on this factory.");
  const meta = await grid.metadata(GRID_CHIP);
  const stakeUnits = FOREMAN_STAKE_COINS * 10n ** BigInt(meta.decimals);
  log(`The Foreman ${config.foreman} mines the ${meta.symbol} mine for ${ROUNDS} rounds. Recaps go under ${config.namespaceOwner}/kova/foreman.`);

  if (!(await grid.starterClaimed(config.foreman))) {
    const claim: any = await deployer.signAndSendTransaction({ receiverId: GRID_CHIP, actions: [actions.functionCall("claim_starter", {}, GAS.claimStarter, 0n)], throwOnFailure: false });
    log(`claimed the starter CHIP ${network.explorerTx(claim.transaction.hash)}`);
  }

  const played = new Map<number, ForemanStake[]>(); // round -> what the mine recorded the Foreman staking
  const posted = new Set<number>();
  const first = roundNow() + 1;
  for (let k = 0; k <= ROUNDS; k += 1) {
    const round = first + k;
    while (roundNow() < round) await sleep(500);
    await sleep(1_500); // a moment into the round, so the round id is surely this one

    // 1. Back this round's squares (not on the last pass, which only posts the final recap).
    if (k < ROUNDS) {
      const near = BigInt(((await provider.viewAccount({ accountId: config.foreman })) as any).amount);
      const squares = pickSquares(config.foreman, round);
      const stop = stopReason({ nearYocto: near, chipUnits: await grid.balance(GRID_CHIP, config.foreman), stakeUnits, squares: squares.length });
      if (stop) {
        log(`stopping: ${stop}`);
        break;
      }
      for (const square of squares) {
        const call = stakeCall({ token: GRID_CHIP, mine, square, units: stakeUnits, round });
        const sent: any = await deployer.signAndSendTransaction({ receiverId: call.contractId, actions: [actions.functionCall(call.method, call.args, call.gas, call.deposit)], throwOnFailure: false });
        const staked = parseEvents([...(sent.transaction_outcome?.outcome.logs ?? []), ...(sent.receipts_outcome ?? []).flatMap((r: any) => r.outcome.logs)]).some((e) => e.event === "staked");
        log(`round ${round}: ${staked ? "staked" : "not staked"} ${formatUnits(stakeUnits, meta.decimals)} ${meta.symbol} on square ${square + 1} ${network.explorerTx(sent.transaction.hash)}`);
      }
      // What the mine recorded is the truth, not what a transaction's logs happened to include.
      const view = await grid.round(mine, round);
      played.set(round, (view?.stakes ?? []).filter((s) => s.player === config.foreman).map((s) => ({ square: s.square, amount: s.amount })));
    }

    // 2. Recap the previous round once it has a result.
    const previous = round - 1;
    if (previous >= first && !posted.has(previous)) {
      let record = null;
      for (let wait = 0; wait < 12 && !record; wait += 1) {
        record = (await grid.recent(mine, 24)).find((r) => r.round === previous) ?? null;
        if (!record) await sleep(5_000);
      }
      const text = composeRecap({ round: previous, record, account: config.foreman, stakes: played.get(previous) ?? [], decimals: meta.decimals, symbol: meta.symbol });
      const sent: any = await poster.signAndSendTransaction({
        receiverId: config.social,
        actions: [actions.functionCall("set", { data: { [config.namespaceOwner]: { kova: { foreman: { [feedSlot(previous)]: feedLeaf(previous, text, "rule") } } } } }, 30_000_000_000_000n, 0n)],
        throwOnFailure: false,
      });
      const failed = JSON.stringify(sent.status).includes("Failure") || (sent.receipts_outcome ?? []).some((o: any) => JSON.stringify(o.outcome.status).includes("Failure"));
      const storage = JSON.stringify(sent).includes("Not enough storage balance");
      log(`${failed ? "POST FAILED" : "posted"} recap for round ${previous}: ${text}\n         ${network.explorerTx(sent.transaction.hash)}`);
      if (storage) log(`         cause: ${config.namespaceOwner} has too little storage balance on ${config.social}. Fix: call storage_deposit on ${config.social} from ${config.namespaceOwner} with a few hundredths of NEAR.`);
      if (!failed) posted.add(previous);
    }
  }
  log(`done: ${posted.size} recaps posted.`);
}

main().catch((error) => {
  console.error("FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});

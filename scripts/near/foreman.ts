/* eslint-disable @typescript-eslint/no-explicit-any -- RPC outcomes and keys arrive as untyped JSON */
/**
 * The Foreman: an account that mines next to you and posts what happened, so each round's recap can
 * be checked on chain. Run it with the keeper (npm run keeper:near) so rounds get settled.
 *
 *   FOREMAN_ROUNDS=10 npm run foreman:near
 *
 * Rule v2: when anyone else stakes in a CHIP round, it puts the mine's smallest stake (1 CHIP) on every
 * square nobody is on, so that round always has a winner; in rounds nobody else plays it does nothing.
 * Its stakes and burns are the team's own, not player activity. Once a covered round has a result it
 * writes a recap into one of five fixed social-contract slots under <owner>/kova/foreman. The post is a template filled from
 * the mine's own round record, labelled `by: "rule"`. If NEAR_AI_API_KEY_FILE (first choice) or
 * BRRRAIN_API_KEY_FILE (backup) names a key file, one short AI remark is added after it and the post says `by: "ai"` with the
 * model; with no key, or on any failure, there is no remark. See src/adapters/near/foreman-voice.ts. It stops by itself if it runs low on NEAR or CHIP, or after FOREMAN_ROUNDS.
 *
 * Its keys: the deploy key (CHIP mine_deploy and claim_starter) and the post key (social `set`),
 * created by foreman:setup, read from ~/.kova-testnet. Neither can move NEAR or CHIP.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Account, KeyPair, KeyPairSigner, actions } from "near-api-js";
import { NEAR_NETWORKS, nearProvider, parseEvents } from "../../src/adapters/near/chip";
import { FOREMAN_COVER_STAKE_COINS, FOREMAN_NEAR_MARGIN_YOCTO, composeRecap, emptySquares, feedLeaf, feedSlot, shouldCover, stopReason, type ForemanStake } from "../../src/adapters/near/foreman";
import { ForemanVoice, backendsFromEnv } from "../../src/adapters/near/foreman-voice";
import { GAS, GRID_CHIP, GridClient, formatUnits, nearNeededFor, stakeCall } from "../../src/adapters/near/grid";

const network = NEAR_NETWORKS.testnet;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const config = JSON.parse(readFileSync(resolve(process.cwd(), "docs/near/v3/foreman.json"), "utf8")) as { foreman: string; namespaceOwner: string; social: string };
const ROUNDS = Number(process.env.FOREMAN_ROUNDS ?? 1000); // rounds it covers, not minutes

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
  const stakeUnits = FOREMAN_COVER_STAKE_COINS * 10n ** BigInt(meta.decimals);
  const voice = new ForemanVoice(backendsFromEnv(process.env, (path) => readFileSync(path, "utf8")));
  log(voice.enabled ? "AI remarks are on (a key file is set)." : "AI remarks are off: no NEAR AI or BRRRAIN key file is set, so every recap is by the rule alone.");
  log(`The Foreman ${config.foreman} watches the ${meta.symbol} mine. Recaps go under ${config.namespaceOwner}/kova/foreman.`);

  if (!(await grid.starterClaimed(config.foreman))) {
    const claim: any = await deployer.signAndSendTransaction({ receiverId: GRID_CHIP, actions: [actions.functionCall("claim_starter", {}, GAS.claimStarter, 0n)], throwOnFailure: false });
    log(`claimed the starter CHIP ${network.explorerTx(claim.transaction.hash)}`);
  }

  const played = new Map<number, ForemanStake[]>(); // round -> what the mine recorded the Foreman staking
  const posted = new Set<number>();
  const covered = new Set<number>();
  let responded = 0;

  async function postRecap(round: number) {
    const record = (await grid.recent(mine!, 24)).find((r) => r.round === round) ?? null;
    if (!record) return; // not settled yet; try again on the next pass
    const text = composeRecap({ round, record, account: config.foreman, stakes: played.get(round) ?? [], decimals: meta.decimals, symbol: meta.symbol });
    const remark = voice.enabled ? await voice.remark(text) : null;
    if (remark) log(`AI remark (${remark.via}, ${remark.model}${remark.powerRemaining === null ? "" : `, ${remark.powerRemaining} Power left`}): ${remark.text}`);
    const sent: any = await poster.signAndSendTransaction({
      receiverId: config.social,
      actions: [actions.functionCall("set", { data: { [config.namespaceOwner]: { kova: { foreman: { [feedSlot(round)]: feedLeaf(round, text, remark ?? undefined) } } } } }, 30_000_000_000_000n, 0n)],
      throwOnFailure: false,
    });
    const failed = JSON.stringify(sent.status).includes("Failure") || (sent.receipts_outcome ?? []).some((o: any) => JSON.stringify(o.outcome.status).includes("Failure"));
    log(`${failed ? "POST FAILED" : "posted"} recap for round ${round}: ${text}\n         ${network.explorerTx(sent.transaction.hash)}`);
    posted.add(round); // one try per round: a failed post is logged, not retried forever
  }

  log(`Rule: when anyone else stakes in a round, cover every empty square with ${formatUnits(stakeUnits, meta.decimals)} ${meta.symbol} so the round has a winner. Rounds with no other player cost nothing. Stops after ${ROUNDS} covered rounds.`);
  while (responded < ROUNDS) {
    await sleep(2_000);
    try {
      const cur = await grid.currentRound(mine);
      const secondsLeft = cur.ends_at - Math.floor(Date.now() / 1000);

      // Recaps for rounds it covered, once they have a result.
      for (const round of played.keys()) if (round < cur.id && !posted.has(round)) await postRecap(round);

      if (cur.players === 0 || covered.has(cur.id)) continue;
      const view = await grid.round(mine, cur.id);
      const others = new Set((view?.stakes ?? []).filter((st) => st.player !== config.foreman).map((st) => st.player)).size;
      if (!shouldCover({ otherPlayers: others, alreadyCovered: covered.has(cur.id), secondsLeft })) continue;
      covered.add(cur.id);

      const squares = emptySquares(cur.totals);
      if (squares.length === 0) continue;
      const near = BigInt(((await provider.viewAccount({ accountId: config.foreman })) as any).amount);
      const stop = stopReason({ nearYocto: near, chipUnits: await grid.balance(GRID_CHIP, config.foreman), stakeUnits, squares: squares.length });
      if (stop) {
        log(`stopping: ${stop}`);
        break;
      }
      // Each stake holds back its gas until it lands, so send as many at once as the balance allows.
      const perStake = nearNeededFor(GAS.mineDeploy, 0n);
      const parallel = Math.max(1, Math.min(8, Number((near - FOREMAN_NEAR_MARGIN_YOCTO) / perStake)));
      log(`round ${cur.id}: ${others} player${others === 1 ? "" : "s"} in, ${secondsLeft}s left. Covering ${squares.length} empty squares, ${parallel} at a time.`);
      let ok = 0;
      for (let i = 0; i < squares.length; i += parallel) {
        const batch = squares.slice(i, i + parallel);
        const results = await Promise.all(
          batch.map(async (square) => {
            const call = stakeCall({ token: GRID_CHIP, mine, square, units: stakeUnits, round: cur.id });
            const sent: any = await deployer.signAndSendTransaction({ receiverId: call.contractId, actions: [actions.functionCall(call.method, call.args, call.gas, call.deposit)], throwOnFailure: false });
            return parseEvents([...(sent.transaction_outcome?.outcome.logs ?? []), ...(sent.receipts_outcome ?? []).flatMap((r: any) => r.outcome.logs)]).some((e) => e.event === "staked");
          }),
        );
        ok += results.filter(Boolean).length;
      }
      const after = await grid.round(mine, cur.id);
      played.set(cur.id, (after?.stakes ?? []).filter((st) => st.player === config.foreman).map((st) => ({ square: st.square, amount: st.amount })));
      responded += 1;
      log(`round ${cur.id}: covered ${ok} of ${squares.length} squares.`);
    } catch (error) {
      log(`pass failed, retrying: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const round of played.keys()) if (!posted.has(round)) await postRecap(round).catch(() => undefined);
  log(`done: ${posted.size} recaps posted.`);
}

main().catch((error) => {
  console.error("FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});

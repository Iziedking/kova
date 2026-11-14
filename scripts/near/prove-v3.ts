/* eslint-disable @typescript-eslint/no-explicit-any -- RPC outcomes and keys arrive as untyped JSON */
/**
 * Plays Kova v3 on NEAR testnet, with real transactions, and checks every unit.
 *
 *   npm run prove:near
 *
 * Needs the testnet deployment recorded in docs/near/v3/testnet.json (made by `npm run
 * deploy:near-v3`). Players are throwaway accounts from the testnet faucet. If the faucet refuses,
 * set PROVE_FUNDER_ACCOUNT and PROVE_FUNDER_KEY_FILE (a funded testnet account, key file outside
 * the repository) and the funder pays for them instead.
 *
 * It checks the two mines (no access keys, running the published code hash), then plays
 * PROVE_ROUNDS rounds (default 8, one a minute): players stake on squares in the CHIP mine (some
 * with CHIP's no-deposit `mine_deploy`, some with `ft_transfer_call`) and in the JAMBO mine. A
 * player who is not the deployer settles each round. Every settled round must pay out exactly what
 * was staked and burn exactly 10% of the losing stakes. At the end the mines' and CHIP's books must
 * balance to the unit. Every transaction's explorer link is printed and saved.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Account, KeyPair, KeyPairSigner, actions } from "near-api-js";
import { NEAR_NETWORKS, nearProvider } from "../../src/adapters/near/chip";

const network = NEAR_NETWORKS.testnet;
const ONE = 10n ** 18n;
const NEAR = 10n ** 24n;
const ROUNDS = Number(process.env.PROVE_ROUNDS ?? 8);
const PLAYERS = Number(process.env.PROVE_PLAYERS ?? 4);
// NEAR reserves 0.001 NEAR per attached Tgas up front and refunds what is not used (a settle burns
// about 15 Tgas), so attach only what each call needs. mine_deploy needs at least 70 Tgas.
const GAS_STAKE_DEPLOY = 80_000_000_000_000n;
const GAS_STAKE_TRANSFER = 100_000_000_000_000n;
const GAS_SETTLE = 150_000_000_000_000n;
const deployment = JSON.parse(readFileSync(resolve(process.cwd(), "docs/near/v3/testnet.json"), "utf8"));
const provider = nearProvider(network);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const links: { what: string; url: string }[] = [];

let seed = BigInt(Date.now()) | 1n;
function random(): number {
  seed ^= seed << 13n;
  seed ^= seed >> 7n;
  seed ^= seed << 17n;
  seed &= (1n << 63n) - 1n;
  return Number(seed % 1_000_003n);
}

function failureOf(result: any): string | undefined {
  const bad = (s: any) => s && typeof s === "object" && "Failure" in s;
  if (bad(result?.status)) return JSON.stringify(result.status.Failure);
  for (const o of result?.receipts_outcome ?? []) if (bad(o.outcome?.status)) return JSON.stringify(o.outcome.status.Failure);
  return undefined;
}

/** The EVENT_JSON logs of every receipt in a transaction. */
function eventsOf(result: any): any[] {
  const out: any[] = [];
  for (const o of result?.receipts_outcome ?? []) {
    for (const line of o.outcome?.logs ?? []) {
      if (typeof line === "string" && line.startsWith("EVENT_JSON:")) {
        try {
          out.push(JSON.parse(line.slice("EVENT_JSON:".length)));
        } catch {
          /* not ours */
        }
      }
    }
  }
  return out;
}

const view = (contractId: string, method: string, args: Record<string, unknown> = {}): Promise<any> => provider.callFunction({ contractId, method, args }) as Promise<any>;
const amount = (v: any) => BigInt(v ?? "0");
const chips = (v: bigint) => (Number(v / 10n ** 14n) / 10_000).toString();

/** One account signs one transaction at a time (its nonce), so queue every account's calls. */
const queues = new Map<string, Promise<unknown>>();
function call(account: Account, receiver: string, method: string, args: object, gas: bigint, deposit = 0n, what?: string): Promise<any> {
  const run = async () => {
    const result = await account.signAndSendTransaction({ receiverId: receiver, actions: [actions.functionCall(method, args as any, gas, deposit)] });
    if (what) links.push({ what, url: network.explorerTx(result.transaction.hash) });
    return result;
  };
  const next = (queues.get(account.accountId) ?? Promise.resolve()).then(run, run);
  queues.set(account.accountId, next.catch(() => undefined));
  return next;
}

/** PROVE_REUSE_PLAYERS=1 reuses the newest saved player keys (see below) instead of creating accounts. */
function savedPlayers(count: number): Account[] | undefined {
  const dir = `${homedir()}/.kova-testnet`;
  if (!process.env.PROVE_REUSE_PLAYERS || !existsSync(dir)) return undefined;
  const files = readdirSync(dir).filter((f) => /^p\d+-.*\.testnet\.key$/.test(f)).map((f) => ({ f, t: statSync(`${dir}/${f}`).mtimeMs })).sort((a, b) => b.t - a.t).slice(0, 4).sort((a, b) => a.f.localeCompare(b.f)).slice(0, count);
  if (files.length < count) return undefined;
  return files.map(({ f }) => new Account(f.replace(/\.key$/, ""), provider, new KeyPairSigner(KeyPair.fromString(readFileSync(`${dir}/${f}`, "utf8").trim() as any))));
}

async function player(i: number): Promise<Account> {
  const key = KeyPair.fromRandom("ed25519");
  let id = `kova-p${i}-${Date.now().toString(36)}.testnet`;
  const response = await fetch("https://helper.nearprotocol.com/account", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ newAccountId: id, newAccountPublicKey: key.getPublicKey().toString() }),
  });
  if (!response.ok) {
    const funderId = process.env.PROVE_FUNDER_ACCOUNT;
    const keyFile = process.env.PROVE_FUNDER_KEY_FILE;
    if (!funderId || !keyFile) throw new Error(`Faucet refused (${response.status}). Set PROVE_FUNDER_ACCOUNT and PROVE_FUNDER_KEY_FILE.`);
    const funder = new Account(funderId, provider, new KeyPairSigner(KeyPair.fromString(readFileSync(keyFile, "utf8").trim() as any)));
    // A funder can only create its own sub-accounts, not a new top-level .testnet name.
    id = `p${i}-${Date.now().toString(36)}.${funderId}`;
    // Keep the key outside the repository so the player's leftover NEAR can be recovered.
    const keyDir = `${homedir()}/.kova-testnet`;
    if (existsSync(keyDir)) writeFileSync(`${keyDir}/${id}.key`, key.toString(), { mode: 0o600 });
    await funder.signAndSendTransaction({
      receiverId: id,
      actions: [actions.createAccount(), actions.transfer((3n * NEAR) / 20n), actions.addFullAccessKey(key.getPublicKey())],
    });
  }
  for (let k = 0; k < 20; k += 1) {
    try {
      await provider.viewAccount({ accountId: id });
      break;
    } catch {
      await sleep(1_500);
    }
  }
  return new Account(id, provider, new KeyPairSigner(key));
}

const roundNow = () => Math.floor(Date.now() / 60_000);
async function untilMinute(round: number) {
  while (roundNow() < round) await sleep(500);
}

async function main() {
  const { chip, jambo, factory } = deployment.accounts as Record<string, string>;
  const coins = [
    { name: "CHIP", token: chip, mine: deployment.mines[chip] as string, settled: 0, refunded: 0, staked: 0n, burnedInEvents: 0n, base: {} as any },
    { name: "JAMBO", token: jambo, mine: deployment.mines[jambo] as string, settled: 0, refunded: 0, staked: 0n, burnedInEvents: 0n, base: {} as any },
  ];
  console.log(`Kova v3 proof on NEAR testnet. Factory ${factory}`);

  console.log("\n1. The mines are what the factory says they are");
  for (const coin of coins) {
    const keys = (await provider.viewAccessKeyList({ accountId: coin.mine })) as any;
    const account = (await provider.viewAccount({ accountId: coin.mine })) as any;
    const info = await view(factory, "get_mine", { token: coin.token });
    if (keys.keys.length !== 0) throw new Error(`${coin.mine} has an access key`);
    console.log(`   ${coin.name} mine ${coin.mine}: ${keys.keys.length} access keys, global code ${account.global_contract_hash ?? "(see explorer)"}`);
    console.log(`       ${network.explorerAccount(coin.mine)}  opened by ${info.opener}`);
    if (account.global_contract_hash && account.global_contract_hash !== deployment.mineCodeHash) throw new Error("the mine runs different code than the published hash");
  }

  console.log("\n2. Players");
  const players: Account[] = [];
  const reused = savedPlayers(PLAYERS);
  for (let i = 0; i < PLAYERS; i += 1) {
    players.push(reused ? reused[i] : await player(i));
    console.log(`   ${players[i].accountId}${reused ? " (reused)" : ""}`);
  }
  const keeper = players[0];

  console.log("\n3. Starter claims (1,000 CHIP and 1,000 JAMBO each, once per account)");
  for (const p of players) {
    for (const coin of coins) {
      if (await view(coin.token, "has_claimed_starter", { account_id: p.accountId })) continue;
      const r = await call(p, coin.token, "claim_starter", {}, 60_000_000_000_000n, 0n, `${p.accountId} claims ${coin.name}`);
      if (failureOf(r)) throw new Error(`claim failed: ${failureOf(r)}`);
    }
  }
  console.log("   done");
  // The mine needs the coin registered with it; CHIP registers a mine on first use, so nothing to do.

  // The mines keep running totals across runs, so compare what this run did against where it began.
  for (const coin of coins) coin.base = await view(coin.mine, "get_stats");

  console.log(`\n4. ${ROUNDS} rounds, one a minute`);
  let pending: number | undefined;
  const wanted = roundNow() + 1;
  let emissionRounds = 0;
  for (let k = 0; k <= ROUNDS; k += 1) {
    const round = wanted + k;
    await untilMinute(round);
    console.log(`-- round ${round} begins`);

    const settling = pending;
    const tasks: Promise<void>[] = [];
    if (settling !== undefined) {
      for (const coin of coins) {
        tasks.push(
          (async () => {
            const r = await call(keeper, coin.mine, "settle", { round: settling.toString() }, GAS_SETTLE, 0n, `${coin.name} settle round ${settling}`);
            const url = network.explorerTx(r.transaction.hash);
            if (failureOf(r)) throw new Error(`settle failed: ${failureOf(r)} ${url}`);
            const events = eventsOf(r);
            const done = events.find((e) => e.event === "round_settled");
            if (done) {
              const d = done.data[0];
              const total = amount(d.total);
              const burned = amount(d.burned);
              const vein = amount(d.vein);
              const awards = d.winners.reduce((s: bigint, x: any) => s + amount(x.award), 0n);
              const onWinner = d.winners.reduce((s: bigint, x: any) => s + amount(x.staked), 0n);
              if (awards + burned !== total + vein) throw new Error(`${coin.name} round ${settling}: payout is not exact`);
              if (burned !== ((total - onWinner) * 10n) / 100n) throw new Error(`${coin.name} round ${settling}: burn is not 10% of the losing stakes`);
              coin.settled += 1;
              coin.burnedInEvents += burned;
              console.log(`   ${coin.name} round ${settling}: square ${d.winning_square}, staked ${chips(total)}, burned ${chips(burned)}, ${d.winners.length} winner(s)\n       ${url}`);
            } else if (events.some((e) => e.event === "round_refunded")) {
              coin.refunded += 1;
              console.log(`   ${coin.name} round ${settling}: empty winning square, everyone refunded\n       ${url}`);
            } else {
              throw new Error(`${coin.name} round ${settling}: settle logged neither a result nor a refund ${url}`);
            }
          })(),
        );
      }
    }
    if (k < ROUNDS) {
      emissionRounds += 1;
      players.forEach((p, index) => {
        tasks.push(
          (async () => {
            const plan: { coin: number; square: number; stake: bigint }[] = [];
            for (let c = 0; c < coins.length; c += 1) {
              const squares = new Set<number>();
              while (squares.size < (c === 0 ? 6 : 3)) squares.add(random() % 25);
              for (const square of squares) plan.push({ coin: c, square, stake: BigInt(10 + (random() % 20)) * ONE });
            }
            for (const { coin: c, square, stake } of plan) {
              const coin = coins[c];
              const viaDeploy = coin.name === "CHIP" && index % 2 === 0;
              const r = viaDeploy
                ? await call(p, coin.token, "mine_deploy", { mine: coin.mine, square, amount: stake.toString(), round: round.toString() }, GAS_STAKE_DEPLOY)
                : await call(p, coin.token, "ft_transfer_call", { receiver_id: coin.mine, amount: stake.toString(), msg: JSON.stringify({ square, round }) }, GAS_STAKE_TRANSFER, 1n);
              if (failureOf(r)) throw new Error(`${coin.name} stake failed: ${failureOf(r)}`);
              const staked = eventsOf(r).some((e) => e.event === "staked");
              if (staked) coin.staked += stake;
              else console.log(`   ${coin.name} ${p.accountId}: stake not accepted (late, so refunded)`);
            }
          })(),
        );
      });
    }
    await Promise.all(tasks);
    pending = k < ROUNDS ? round : undefined;
  }

  console.log("\n5. The books");
  for (const coin of coins) {
    let stats: any;
    for (let i = 0; i < 40; i += 1) {
      stats = await view(coin.mine, "get_stats");
      const accounted = amount(stats.held) + amount(stats.paid_total) + amount(stats.claimable_total) + amount(stats.burned_by_burn) + amount(stats.burned_by_transfer) + amount(stats.pending_burn);
      if (amount(stats.staked_total) === accounted) break;
      await sleep(1_500);
    }
    const f = (k: string) => amount(stats[k]);
    console.log(`   ${coin.name} mine: ${JSON.stringify(stats)}`);
    if (f("held") !== 0n) throw new Error(`${coin.name}: a round is unsettled`);
    if (f("staked_total") - amount(coin.base.staked_total) !== coin.staked) throw new Error(`${coin.name}: the mine saw ${f("staked_total") - amount(coin.base.staked_total)} this run, accepted stakes were ${coin.staked}`);
    if (f("staked_total") !== f("paid_total") + f("claimable_total") + f("burned_by_burn") + f("burned_by_transfer") + f("pending_burn")) throw new Error(`${coin.name}: coins are missing`);
    if (f("burned_by_burn") - amount(coin.base.burned_by_burn) !== coin.burnedInEvents) throw new Error(`${coin.name}: ft_burn burned ${f("burned_by_burn")}, the rounds said ${coin.burnedInEvents}`);
    if (Number(stats.rounds_settled) - Number(coin.base.rounds_settled) !== coin.settled || Number(stats.rounds_refunded) - Number(coin.base.rounds_refunded) !== coin.refunded) throw new Error(`${coin.name}: round counts differ`);
    const held = (await view(coin.token, "ft_balance_of", { account_id: coin.mine })) as string;
    if (amount(held) !== f("claimable_total") + f("vein") + f("pending_burn")) throw new Error(`${coin.name}: the mine holds more or less than it owes`);
  }
  const chipStats: any = await view(chip, "get_stats");
  const supply = amount(chipStats.total_supply);
  if (supply !== amount(chipStats.total_minted) - amount(chipStats.total_burned)) throw new Error("CHIP supply is not minted less burned");
  if (amount(chipStats.total_minted) > amount(chipStats.cap)) throw new Error("CHIP minted past its cap");
  console.log(`   CHIP: minted ${chips(amount(chipStats.total_minted))} (emission ${chips(amount(chipStats.emission_minted))}, motherlode ${chips(amount(chipStats.motherlode_minted))}, starter ${chips(amount(chipStats.starter_minted))}), burned ${chips(amount(chipStats.total_burned))}, supply ${chips(supply)}`);

  const out = resolve(process.cwd(), "docs/near/v3/proof-testnet.json");
  writeFileSync(
    out,
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        rounds: ROUNDS,
        mines: coins.map((c) => ({ coin: c.name, mine: c.mine, settled: c.settled, refunded: c.refunded, staked: c.staked.toString(), burnedByBurn: c.burnedInEvents.toString() })),
        chip: { minted: chipStats.total_minted, burned: chipStats.total_burned, supply: chipStats.total_supply },
        links,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`\nPASS. ${emissionRounds} rounds played. Saved ${out}`);
}

main().catch((error) => {
  console.error("\nFAILED:", error instanceof Error ? error.message : error);
  if (error instanceof Error) console.error(error.stack, (error as any).cause ?? "");
  process.exit(1);
});

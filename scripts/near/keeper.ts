/* eslint-disable @typescript-eslint/no-explicit-any -- RPC outcomes arrive as untyped JSON */
/**
 * Settles every ended round in every mine of the Kova v3 factory. Anyone can call `settle`; this is
 * the simplest keeper, run until the Foreman (Phase 4) takes the job over.
 *
 *   KEEPER_ACCOUNT=<account>.testnet KEEPER_KEY_FILE=<path> npm run keeper:near
 *
 * The key file holds one `ed25519:...` secret key, outside the repository. A settle reserves 0.15
 * NEAR of gas up front (and returns what it does not use; it burns about 0.002), so the account
 * needs a little more than that. A round older than ten minutes can only be refunded, so that is
 * what the keeper does with it, however old it is (up to four hours).
 */
import { readFileSync } from "node:fs";
import { Account, KeyPair, KeyPairSigner, actions } from "near-api-js";
import { type ChipEvent, NEAR_NETWORKS, nearProvider, parseEvents } from "../../src/adapters/near/chip";
import { GAS, GridClient, formatUnits } from "../../src/adapters/near/grid";

const SETTLE_WINDOW_SECONDS = 600;

export type Settled = { mine: string; round: number; kind: "settled" | "refunded" | "failed"; detail: string; url: string; events: ChipEvent[] };

const metadata = new Map<string, { symbol: string; decimals: number }>();

/**
 * Settles what has ended, and refunds what has been waiting too long. A mine says how many coins it
 * still holds in unsettled rounds (`held`), so the keeper asks that first: when nothing is held it
 * makes no more calls, and otherwise it looks back only as far as needed to account for every held
 * coin (at most `maxDepth` rounds). That keeps the RPC traffic small and finds a round that has been
 * stuck for an hour just as well as one that ended a minute ago.
 */
export async function settleDue(keeper: Account, grid: GridClient, log: (line: string) => void = () => undefined, maxDepth = 240): Promise<Settled[]> {
  const done: Settled[] = [];
  for (const info of await grid.mines()) {
    const [cur, stats] = await Promise.all([grid.currentRound(info.mine), grid.stats(info.mine)]);
    // Coins in the round still being played are held too, but cannot be settled yet.
    let remaining = stats.held > cur.total ? stats.held - cur.total : 0n;
    if (remaining === 0n) continue;
    let meta = metadata.get(info.token);
    if (!meta) {
      meta = await grid.metadata(info.token);
      metadata.set(info.token, meta);
    }
    for (let id = cur.id - 1; id >= cur.id - maxDepth && remaining > 0n; id -= 1) {
      const round = await grid.round(info.mine, id);
      if (!round) continue; // no stakes, or already settled or refunded
      remaining = remaining > round.total ? remaining - round.total : 0n;
      const age = cur.ends_at - (id + 1) * 60;
      const method = age >= SETTLE_WINDOW_SECONDS ? "refund_round" : "settle";
      const outcome = await keeper.signAndSendTransaction({ receiverId: info.mine, actions: [actions.functionCall(method, { round: String(id) }, GAS.settle, 0n)], throwOnFailure: false });
      const url = grid.network.explorerTx(outcome.transaction.hash);
      const logs = [...(outcome.transaction_outcome?.outcome.logs ?? []), ...(outcome.receipts_outcome ?? []).flatMap((r: any) => r.outcome.logs)];
      const events = parseEvents(logs);
      const result = events.find((e) => e.event === "round_settled");
      const refund = events.find((e) => e.event === "round_refunded");
      const entry: Settled = result
        ? { mine: info.mine, round: id, kind: "settled", detail: `square ${(result.data[0] as any).winning_square}, ${formatUnits(BigInt((result.data[0] as any).total), meta.decimals)} ${meta.symbol} staked, ${formatUnits(BigInt((result.data[0] as any).burned), meta.decimals)} burned`, url, events }
        : refund
          ? { mine: info.mine, round: id, kind: "refunded", detail: `${(refund.data[0] as any).reason}`, url, events }
          : { mine: info.mine, round: id, kind: "failed", detail: `${method} logged no result`, url, events };
      log(`${meta.symbol} round ${id}: ${entry.kind} (${entry.detail}) ${url}`);
      done.push(entry);
    }
  }
  return done;
}

async function main() {
  const accountId = process.env.KEEPER_ACCOUNT;
  const keyFile = process.env.KEEPER_KEY_FILE;
  if (!accountId || !keyFile) throw new Error("Set KEEPER_ACCOUNT and KEEPER_KEY_FILE (a testnet account with at least 0.2 NEAR).");
  const network = NEAR_NETWORKS.testnet;
  const provider = nearProvider(network);
  const keeper = new Account(accountId, provider, new KeyPairSigner(KeyPair.fromString(readFileSync(keyFile, "utf8").trim() as any)));
  const grid = new GridClient(network, provider);
  console.log(`Keeper ${accountId} settling every mine of the factory. Ctrl-C to stop.`);
  for (;;) {
    // Two passes a minute, 3 s and 33 s in: the first settles the round that just ended, the second retries.
    const now = Date.now() / 1000;
    const next = now % 60 < 3 ? Math.floor(now / 60) * 60 + 3 : now % 60 < 33 ? Math.floor(now / 60) * 60 + 33 : Math.floor(now / 60) * 60 + 63;
    await new Promise((r) => setTimeout(r, Math.max(0, next - now) * 1000));
    try {
      await settleDue(keeper, grid, (line) => console.log(`${new Date().toISOString()} ${line}`));
    } catch (error) {
      console.error(`${new Date().toISOString()} keeper pass failed: ${error instanceof Error ? error.message : error}`);
    }
  }
}

if (process.argv[1]?.endsWith("keeper.ts")) void main();

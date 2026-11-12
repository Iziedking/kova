/**
 * The log of every CHIP mint and burn, for the token page.
 *
 * NearBlocks v3 indexes NEP-141 events with their transaction hash (checked 2026-11-12:
 * GET https://api-testnet.nearblocks.io/v3/fts/{contract}/txns, results under `data`, cursor in
 * `meta.next_page`). It does not return the memo, which holds the reason, so each transaction's
 * logs are read once from NEAR RPC. Transactions never change, so those reads are cached forever.
 */
import { z } from "zod";
import { type ChipClient, parseEvents } from "../../adapters/near/chip";

const nearblocks = z.object({
  data: z
    .array(
      z.object({
        affected_account_id: z.string().nullable(),
        involved_account_id: z.string().nullable(),
        cause: z.string(),
        delta_amount: z.string(),
        block_timestamp: z.string(),
        transaction_hash: z.string(),
        event_index: z.number().optional(),
      }),
    )
    .nullable(),
});

export type ChainLogEntry = {
  kind: "mint" | "burn";
  amount: string;
  account: string | null;
  reason: string;
  memo: string | null;
  at: string;
  txHash: string;
  explorerUrl: string;
};

function reasonOf(memo: string | null): string {
  if (!memo) return "Unlabelled";
  if (memo === "genesis:treasury") return "Genesis: treasury";
  if (memo === "genesis:house_bankroll") return "Genesis: House bankroll";
  const table = memo.match(/^pot_burn:table:(\d+)$/);
  if (table) return `Pot burn, table ${table[1]}`;
  const miss = memo.match(/^daily_miss:day:(\d+)$/);
  if (miss) return `Daily call missed, day ${miss[1]}`;
  const call = memo.match(/^daily_call:day:(\d+)$/);
  if (call) return `Daily call met, day ${call[1]}`;
  return memo;
}

type EventMemo = { owner: string; amount: string; memo: string };
type TxMemos = { mint: EventMemo[]; burn: EventMemo[] };

/**
 * The memo for one NearBlocks row. Rows are matched to events by account and amount, not by
 * position: NearBlocks lists a transaction's events newest first, so position alone swaps the
 * labels whenever one transaction mints or burns twice. `used` holds events already matched.
 */
export function memoForRow(events: readonly EventMemo[], used: Set<number>, owner: string | null, amount: string): string | null {
  let index = events.findIndex((e, i) => !used.has(i) && e.owner === owner && e.amount === amount);
  if (index < 0) index = events.findIndex((e, i) => !used.has(i) && e.amount === amount);
  if (index < 0) return null;
  used.add(index);
  return events[index].memo || null;
}

export class ChainLog {
  private readonly memos = new Map<string, TxMemos>();
  private cache: { at: number; entries: ChainLogEntry[] } | null = null;

  constructor(
    private readonly chip: ChipClient,
    private readonly apiBase = chip.network.networkId === "testnet" ? "https://api-testnet.nearblocks.io" : "https://api.nearblocks.io",
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  /** Mint and burn events of one transaction, with their memos, in event order. */
  private async memosOf(txHash: string, signer: string): Promise<TxMemos> {
    const cached = this.memos.get(txHash);
    if (cached) return cached;
    const outcome = (await this.chip.provider.viewTransactionStatus({ txHash, accountId: signer, waitUntil: "FINAL" } as Parameters<typeof this.chip.provider.viewTransactionStatus>[0])) as unknown as {
      receipts_outcome: { outcome: { logs: string[]; executor_id: string } }[];
    };
    const logs = outcome.receipts_outcome.filter((r) => r.outcome.executor_id === this.chip.contractId).flatMap((r) => r.outcome.logs);
    const result: TxMemos = { mint: [], burn: [] };
    for (const event of parseEvents(logs)) {
      if (event.standard !== "nep141") continue;
      for (const item of event.data) {
        const entry = { owner: String(item.owner_id ?? ""), amount: String(item.amount ?? ""), memo: typeof item.memo === "string" ? item.memo : "" };
        if (event.event === "ft_mint") result.mint.push(entry);
        if (event.event === "ft_burn") result.burn.push(entry);
      }
    }
    this.memos.set(txHash, result);
    return result;
  }

  async recent(limit = 40): Promise<ChainLogEntry[]> {
    if (this.cache && Date.now() - this.cache.at < 20_000) return this.cache.entries;
    const response = await this.fetcher(`${this.apiBase}/v3/fts/${encodeURIComponent(this.chip.contractId)}/txns?limit=100`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`NearBlocks ${response.status}`);
    const rows = (nearblocks.parse(await response.json()).data ?? []).filter((r) => r.cause === "MINT" || r.cause === "BURN").slice(0, limit);
    const used = new Map<string, { mint: Set<number>; burn: Set<number> }>();
    const entries: ChainLogEntry[] = [];
    for (const row of rows) {
      const kind = row.cause === "MINT" ? "mint" : "burn";
      const amount = row.delta_amount.replace(/^-/, "");
      let memo: string | null = null;
      try {
        // The transaction's signer is not in the row; the contract's own receipts carry the logs,
        // and RPC accepts the receiver for this lookup.
        const memos = await this.memosOf(row.transaction_hash, this.chip.contractId);
        const taken = used.get(row.transaction_hash) ?? { mint: new Set<number>(), burn: new Set<number>() };
        used.set(row.transaction_hash, taken);
        memo = memoForRow(memos[kind], taken[kind], row.affected_account_id, amount);
      } catch {
        memo = null;
      }
      entries.push({
        kind,
        amount,
        account: row.affected_account_id,
        reason: reasonOf(memo),
        memo,
        at: new Date(Number(BigInt(row.block_timestamp) / 1_000_000n)).toISOString(),
        txHash: row.transaction_hash,
        explorerUrl: this.chip.network.explorerTx(row.transaction_hash),
      });
    }
    this.cache = { at: Date.now(), entries };
    return entries;
  }
}

/**
 * CHIP contract client on NEAR. The one seam for every read and write the app, the settlement
 * worker and the proof script make against near/chip.
 *
 * Views go through the RPC provider and are validated here. Calls are signed by whichever
 * `Account` the caller passes in: a player's function-call key in the browser, the settler or
 * the House on the server, throwaway accounts in the proof script. This module never holds a key.
 */
import { Account, JsonRpcProvider, actions } from "near-api-js";
import { z } from "zod";

export type NearNetworkId = "testnet" | "mainnet";

export type NearNetwork = {
  networkId: NearNetworkId;
  rpcUrl: string;
  explorerTx: (hash: string) => string;
  explorerAccount: (accountId: string) => string;
};

/** Public endpoints from docs.near.org/api/rpc/providers, checked 2026-11-12. */
export const NEAR_NETWORKS: Record<NearNetworkId, NearNetwork> = {
  testnet: {
    networkId: "testnet",
    rpcUrl: "https://test.rpc.fastnear.com",
    explorerTx: (hash) => `https://testnet.nearblocks.io/txns/${hash}`,
    explorerAccount: (accountId) => `https://testnet.nearblocks.io/address/${accountId}`,
  },
  mainnet: {
    networkId: "mainnet",
    rpcUrl: "https://free.rpc.fastnear.com",
    explorerTx: (hash) => `https://nearblocks.io/txns/${hash}`,
    explorerAccount: (accountId) => `https://nearblocks.io/address/${accountId}`,
  },
};

/** 1 CHIP in base units (18 decimals). */
export const CHIP = 10n ** 18n;
/** Prices are reported with 18 decimals. */
export const PRICE_ONE = 10n ** 18n;
export const PICK_DOMAIN = "kova-chip-pick-v1";
/** Every game call carries no deposit, so a function-call access key can sign it. */
export const GAME_METHODS = ["claim_starter", "open_table", "join_table", "lock_table", "void_table", "close_day", "claim_daily", "collect_blinds"] as const;
export const CALL_GAS = 100_000_000_000_000n; // 100 Tgas

const u128 = z.string().regex(/^\d+$/).transform((v) => BigInt(v));

export const configSchema = z.object({
  settler: z.string(),
  starter_amount: u128,
  min_stake: u128,
  max_stake: u128,
  pot_burn_bps: z.number().int(),
  daily_target_tables: z.number().int(),
  daily_mint: u128,
  daily_miss_burn_bps: z.number().int(),
  blind_grace_seconds: z.number().int(),
  blind_period_seconds: z.number().int(),
  blind_bps: z.number().int(),
  blind_floor: u128,
});
export type ChipConfig = z.infer<typeof configSchema>;

export const statsSchema = z.object({
  total_supply: u128,
  circulating: u128,
  treasury: u128,
  escrow: u128,
  initial_supply: u128,
  total_minted: u128,
  total_burned: u128,
  pot_burned: u128,
  daily_burned: u128,
  blinds_collected: u128,
  starters_claimed: z.number().int(),
  tables_opened: z.number().int(),
  tables_settled: z.number().int(),
  tables_refunded: z.number().int(),
  launch_day: z.number().int(),
  today: z.number().int(),
  today_settled_tables: z.number().int(),
  today_players: z.number().int(),
  daily_target_tables: z.number().int(),
});
export type ChipStats = z.infer<typeof statsSchema>;

export const tableStatusSchema = z.enum(["Open", "Locked", "Active", "Settled", "Cancelled", "Voided"]);
export type ChipTableStatus = z.infer<typeof tableStatusSchema>;

const seatSchema = z.object({
  player: z.string(),
  commitment: z.string(),
  market: z.string().nullable(),
  start_price: u128.nullable(),
  end_price: u128.nullable(),
  score_bps: z.number().int().nullable(),
  award: u128,
});

export const tableSchema = z.object({
  id: z.string().regex(/^\d+$/),
  host: z.string(),
  stake: u128,
  seats: z.number().int(),
  round_seconds: z.number().int(),
  status: tableStatusSchema,
  opened_at: z.number().int(),
  open_until: z.number().int(),
  locked_at: z.number().int(),
  start_deadline: z.number().int(),
  starts_at: z.number().int(),
  ends_at: z.number().int(),
  settle_deadline: z.number().int(),
  pot: u128,
  burned: u128,
  winners: z.number().int(),
  players: z.array(seatSchema),
});
export type ChipTable = z.infer<typeof tableSchema>;

export const holderSchema = z.object({
  registered: z.boolean(),
  balance: u128,
  stored_balance: u128,
  pending_blind: u128,
  last_play: z.number().int(),
  blind_through: z.number().int(),
  starter_claimed: z.boolean(),
});
export type ChipHolder = z.infer<typeof holderSchema>;

export const daySchema = z.object({
  settled_tables: z.number().int(),
  players: z.number().int(),
  closed: z.boolean(),
  target_met: z.boolean(),
  share: u128,
  minted: u128,
  burned: u128,
});
export type ChipDay = z.infer<typeof daySchema>;

const dailyClaimSchema = z.object({ played: z.boolean(), claimed: z.boolean(), claimable: u128 });

/** One NEP-297 event from a transaction's logs. */
export type ChipEvent = { standard: string; event: string; data: Record<string, unknown>[] };

export type ChipCallResult<T = unknown> = {
  txHash: string;
  explorerUrl: string;
  success: boolean;
  failure?: string;
  logs: string[];
  events: ChipEvent[];
  value?: T;
};

export type Reveal = { player: string; market: string; salt: string; startPrice: bigint };
export type PriceReport = { player: string; endPrice: bigint };

/** sha256 hex of `kova-chip-pick-v1|player|market|salt`. Same as `pick_commitment` in the contract. */
export async function pickCommitment(player: string, market: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${PICK_DOMAIN}|${player}|${market}|${salt}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 32 random bytes as hex. Kept by the player (or the server for the House) until the reveal. */
export function newSalt(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function parseEvents(logs: readonly string[]): ChipEvent[] {
  const events: ChipEvent[] = [];
  for (const log of logs) {
    if (!log.startsWith("EVENT_JSON:")) continue;
    try {
      const parsed = JSON.parse(log.slice("EVENT_JSON:".length)) as ChipEvent;
      if (typeof parsed.event === "string" && Array.isArray(parsed.data)) events.push(parsed);
    } catch {
      // A malformed log is not an event; ignore it.
    }
  }
  return events;
}

/** Formats base units as CHIP with up to `digits` decimals. */
export function formatChip(amount: bigint, digits = 2): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const whole = abs / CHIP;
  const fraction = (abs % CHIP).toString().padStart(18, "0").slice(0, digits).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}

type Outcome = {
  transaction: { hash: string };
  status: unknown;
  transaction_outcome: { outcome: { logs: string[] } };
  receipts_outcome: { outcome: { logs: string[]; status: unknown } }[];
};

function failureOf(status: unknown): string | undefined {
  if (status && typeof status === "object" && "Failure" in status) return JSON.stringify((status as { Failure: unknown }).Failure);
  return undefined;
}

function successValue(status: unknown): unknown {
  if (status && typeof status === "object" && "SuccessValue" in status) {
    const raw = (status as { SuccessValue: string }).SuccessValue;
    if (!raw) return undefined;
    try {
      return JSON.parse(atob(raw));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Reads any final execution outcome (from near-api-js or a wallet) into a call result. */
export function resultFromOutcome<T = unknown>(raw: unknown, network: NearNetwork): ChipCallResult<T> {
  const outcome = raw as Outcome;
  const logs = [...(outcome.transaction_outcome?.outcome.logs ?? []), ...(outcome.receipts_outcome ?? []).flatMap((r) => r.outcome.logs)];
  const failure = failureOf(outcome.status) ?? (outcome.receipts_outcome ?? []).map((r) => failureOf(r.outcome.status)).find(Boolean);
  return {
    txHash: outcome.transaction.hash,
    explorerUrl: network.explorerTx(outcome.transaction.hash),
    success: failure === undefined,
    failure,
    logs,
    events: parseEvents(logs),
    value: successValue(outcome.status) as T | undefined,
  };
}

/** The contract's panic message from a failure, for people to read. */
export function failureMessage(failure: string | undefined): string {
  if (!failure) return "";
  const match = failure.match(/Smart contract panicked: ([^"\\]+)/) ?? failure.match(/"panic_msg":"([^"]+)"/) ?? failure.match(/ExecutionError":"([^"]+)"/);
  return match ? match[1] : "The transaction failed.";
}

export class ChipClient {
  readonly provider: JsonRpcProvider;

  constructor(readonly contractId: string, readonly network: NearNetwork, provider?: JsonRpcProvider) {
    this.provider = provider ?? new JsonRpcProvider({ url: network.rpcUrl });
  }

  private async view<T>(method: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    const raw = await this.provider.callFunction({ contractId: this.contractId, method, args });
    return schema.parse(raw);
  }

  getConfig() { return this.view("get_config", {}, configSchema); }
  getStats() { return this.view("get_stats", {}, statsSchema); }
  getTable(tableId: string) { return this.view("get_table", { table_id: tableId }, tableSchema.nullable()); }
  getTables(before?: string, limit = 20) { return this.view("get_tables", { before: before ?? null, limit }, z.array(tableSchema)); }
  getHolder(accountId: string) { return this.view("get_holder", { account_id: accountId }, holderSchema); }
  getDay(day: number) { return this.view("get_day", { day }, daySchema); }
  getDailyClaim(day: number, accountId: string) { return this.view("get_daily_claim", { day, account_id: accountId }, dailyClaimSchema); }
  async balanceOf(accountId: string): Promise<bigint> { return this.view("ft_balance_of", { account_id: accountId }, u128); }

  /** Sends one call and returns its hash, logs, events and return value. Never throws on a contract failure. */
  async call<T = unknown>(account: Account, method: string, args: Record<string, unknown>, deposit = 0n): Promise<ChipCallResult<T>> {
    // throwOnFailure: false keeps a refused call's transaction hash, so refusals are evidence too.
    const outcome = await account.signAndSendTransaction({
      receiverId: this.contractId,
      actions: [actions.functionCall(method, args, CALL_GAS, deposit)],
      throwOnFailure: false,
    });
    return resultFromOutcome<T>(outcome, this.network);
  }

  claimStarter(player: Account) { return this.call<string>(player, "claim_starter", {}); }

  openTable(host: Account, input: { stake: bigint; seats: number; roundSeconds: number; openSeconds: number; commitment: string }) {
    return this.call<string>(host, "open_table", { stake: input.stake.toString(), seats: input.seats, round_seconds: input.roundSeconds, open_seconds: input.openSeconds, commitment: input.commitment });
  }

  joinTable(player: Account, tableId: string, commitment: string) { return this.call(player, "join_table", { table_id: tableId, commitment }); }
  lockTable(host: Account, tableId: string) { return this.call(host, "lock_table", { table_id: tableId }); }
  voidTable(anyone: Account, tableId: string) { return this.call(anyone, "void_table", { table_id: tableId }); }
  closeDay(anyone: Account, day: number) { return this.call(anyone, "close_day", { day }); }
  claimDaily(player: Account, day: number) { return this.call<string>(player, "claim_daily", { day }); }
  collectBlinds(anyone: Account, accountId: string) { return this.call<string>(anyone, "collect_blinds", { account_id: accountId }); }

  startRound(settler: Account, tableId: string, reveals: readonly Reveal[]) {
    return this.call(settler, "start_round", {
      table_id: tableId,
      reveals: reveals.map((r) => ({ player: r.player, market: r.market, salt: r.salt, start_price: r.startPrice.toString() })),
    });
  }

  settleRound(settler: Account, tableId: string, reports: readonly PriceReport[]) {
    return this.call(settler, "settle_round", {
      table_id: tableId,
      reports: reports.map((r) => ({ player: r.player, end_price: r.endPrice.toString() })),
    });
  }
}

/**
 * CHIP contract client on NEAR. The one seam for every read and write the app, the settlement
 * worker and the proof script make against near/chip.
 *
 * Views go through the RPC provider and are validated here. Calls are signed by whichever
 * `Account` the caller passes in: a player's function-call key in the browser, the settler or
 * the House on the server, throwaway accounts in the proof script. This module never holds a key.
 */
import { Account, FailoverRpcProvider, JsonRpcProvider, type Provider, actions } from "near-api-js";
import { z } from "zod";

export type NearNetworkId = "testnet" | "mainnet";

export type NearNetwork = {
  networkId: NearNetworkId;
  rpcUrl: string;
  /** Tried in order when rpcUrl refuses or fails a request (FastNEAR answers 429 under load). */
  fallbackRpcUrls?: readonly string[];
  explorerTx: (hash: string) => string;
  explorerAccount: (accountId: string) => string;
};

/**
 * A dedicated RPC for the browser, from NEXT_PUBLIC_NEAR_RPC_URL (for example a FastNEAR key URL).
 * The free public endpoints below rate-limit a busy page hard; set this for any real deployment.
 */
const DEDICATED_RPC = process.env.NEXT_PUBLIC_NEAR_RPC_URL || undefined;
const DEDICATED_FOR: NearNetworkId = process.env.NEXT_PUBLIC_NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet";

/**
 * Public endpoints from docs.near.org/api/rpc/providers, checked 2026-11-14: each answered a view
 * call and allowed browser requests (CORS). rpc.testnet.near.org and rpc.mainnet.near.org are not on
 * that list and answer 429 "deprecated", so they are not used. All free tiers rate-limit.
 */
export const NEAR_NETWORKS: Record<NearNetworkId, NearNetwork> = {
  testnet: {
    networkId: "testnet",
    rpcUrl: (DEDICATED_FOR === "testnet" && DEDICATED_RPC) || "https://test.rpc.fastnear.com",
    fallbackRpcUrls: ["https://near-testnet.drpc.org", "https://testnet-rpc.intea.rs", "https://api.zan.top/near-testnet"],
    explorerTx: (hash) => `https://testnet.nearblocks.io/txns/${hash}`,
    explorerAccount: (accountId) => `https://testnet.nearblocks.io/address/${accountId}`,
  },
  mainnet: {
    networkId: "mainnet",
    rpcUrl: (DEDICATED_FOR === "mainnet" && DEDICATED_RPC) || "https://free.rpc.fastnear.com",
    fallbackRpcUrls: ["https://near.drpc.org", "https://rpc.intea.rs", "https://api.zan.top/near-mainnet"],
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
export const GAME_METHODS = ["claim_starter", "open_table", "join_table", "lock_table", "void_table", "close_day", "claim_daily", "collect_blinds", "create_clan", "join_clan", "leave_clan"] as const;
/**
 * 30 Tgas per game call. A call burns about 3 Tgas (settle_round, the heaviest, about 4), so this is
 * ten times the need. More is not free: NEAR reserves prepaid gas at up to ten times the gas price
 * before a call runs, so 100 Tgas held about 0.1 NEAR per call, more than a new email account has.
 */
export const CALL_GAS = 30_000_000_000_000n;

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
  // Clan fields exist from the clan contract on; optional so the first contract still reads.
  clan_create_burn: u128.optional(),
  clan_max_members: z.number().int().optional(),
  clan_top_weight: z.number().int().optional(),
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
  clan_burned: u128.optional(),
  clans_created: z.number().int().optional(),
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
  top_clan: z.string().nullable().optional(),
  top_clan_tables: z.number().int().optional(),
  top_clan_players: z.number().int().optional(),
  top_share: u128.optional(),
});
export type ChipDay = z.infer<typeof daySchema>;

export const dailyClaimSchema = z.object({
  played: z.boolean(),
  claimed: z.boolean(),
  claimable: u128,
  clan: z.string().nullable().optional(),
  top_clan: z.boolean().optional(),
});

export const clanSchema = z.object({ name: z.string(), founder: z.string(), created_at: z.number().int(), members: z.array(z.string()) });
export type ChipClan = z.infer<typeof clanSchema>;
export const clanSummarySchema = z.object({ name: z.string(), founder: z.string(), created_at: z.number().int(), members: z.number().int() });
export type ChipClanSummary = z.infer<typeof clanSummarySchema>;
export const clanDaySchema = z.object({ tables: z.number().int(), players: z.number().int() });
export type ChipClanDay = z.infer<typeof clanDaySchema>;

/** 3 to 24 characters of a-z, 0-9 and '-', not starting or ending with '-'. Same rule as the contract. */
export function isClanName(name: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,22})[a-z0-9]$/.test(name);
}

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

/** The id of the table an open_table call created: its return value, or else its table_opened event. */
export function openedTableId(result: Pick<ChipCallResult, "value" | "events">): string | null {
  if (typeof result.value === "string" && /^\d+$/.test(result.value)) return result.value;
  const id = result.events.find((e) => e.standard === "kova" && e.event === "table_opened")?.data[0]?.table_id;
  return typeof id === "string" && /^\d+$/.test(id) ? id : null;
}

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
  // A message the session already wrote for a person (see lowBalanceMessage in grid.ts) is kept as it is.
  if (/NEAR for gas \(most is returned\)|The network is busy\./.test(failure)) return failure;
  const match = failure.match(/Smart contract panicked: ([^"\\]+)/) ?? failure.match(/"panic_msg":"([^"]+)"/) ?? failure.match(/ExecutionError":"([^"]+)"/);
  if (match) return match[1];
  if (/not enough balance/i.test(failure)) return "This account does not have enough testnet NEAR for the gas. Add a little NEAR to it and try again.";
  if (/allowance/i.test(failure)) return "The game key has used up its gas allowance. Turn the game key on again.";
  return "The transaction failed.";
}

/**
 * One provider per endpoint, each with a single retry so a refusal moves on quickly, behind a
 * failover that tries the next endpoint when one refuses or fails.
 */
export function nearProvider(network: NearNetwork): Provider {
  const urls = [network.rpcUrl, ...(network.fallbackRpcUrls ?? [])].filter((url, i, all) => all.indexOf(url) === i);
  const providers = urls.map((url) => new JsonRpcProvider({ url }, { retries: 1 }));
  return providers.length === 1 ? providers[0] : new FailoverRpcProvider(providers);
}

export class ChipClient {
  readonly provider: Provider;

  constructor(readonly contractId: string, readonly network: NearNetwork, provider?: Provider) {
    this.provider = provider ?? nearProvider(network);
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
  getClan(name: string) { return this.view("get_clan", { name }, clanSchema.nullable()); }
  getClans(before?: number, limit = 20) { return this.view("get_clans", { before: before ?? null, limit }, z.array(clanSummarySchema)); }
  getAccountClan(accountId: string) { return this.view("get_account_clan", { account_id: accountId }, z.string().nullable()); }
  getClanDay(day: number, name: string) { return this.view("get_clan_day", { day, name }, clanDaySchema); }

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

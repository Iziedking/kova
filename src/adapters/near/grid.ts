/**
 * Kova v3 on NEAR: reads from the factory, the mines and CHIP v3.
 *
 * Everything here is a view call (no keys, no cost) answered by the contracts in near/factory,
 * near/mine and near/chip-v3. Responses are validated at the boundary: a field that is missing or
 * the wrong shape throws instead of reaching the screen as a wrong number.
 *
 * Amounts are bigint in the coin's smallest unit. Each coin has its own decimals (CHIP and JAMBO
 * use 18); `formatUnits` takes them from the coin's `ft_metadata`.
 */
import type { Provider } from "near-api-js";
import { z } from "zod";
import { NEAR_NETWORKS, type NearNetwork, type NearNetworkId, nearProvider } from "./chip";

export const GRID_NETWORK_ID: NearNetworkId = process.env.NEXT_PUBLIC_NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet";
/** The testnet deployment recorded in docs/near/v3/testnet.json. Override for another deployment. */
export const GRID_FACTORY = process.env.NEXT_PUBLIC_KOVA_FACTORY ?? "factory.kova-v3-mwg6hrmb.testnet";
export const GRID_CHIP = process.env.NEXT_PUBLIC_KOVA_CHIP ?? "chip.kova-v3-mwg6hrmb.testnet";
/** The Foreman: an account with only function-call keys, and where its recaps are posted (docs/near/v3/foreman.json). */
export const FOREMAN_ACCOUNT = process.env.NEXT_PUBLIC_KOVA_FOREMAN ?? "foreman.kova-v3-mwg6hrmb.testnet";
export const FOREMAN_NAMESPACE_OWNER = process.env.NEXT_PUBLIC_KOVA_FOREMAN_OWNER ?? "kova-v3-mwg6hrmb.testnet";
/** NearSocial's SocialDB on testnet (github.com/NearSocial/social-db). */
export const SOCIAL_CONTRACT = process.env.NEXT_PUBLIC_KOVA_SOCIAL ?? "v1.social08.testnet";
export const SQUARES = 25;
/** The only methods a Kova v3 game key may call, on CHIP. Neither takes a deposit, so the key can move no coins. */
export const GRID_KEY_METHODS = ["mine_deploy", "claim_starter"] as const;
/** What opening a mine costs, sent to the new mine to run on (the factory's MINE_DEPOSIT). */
export const MINE_DEPOSIT_YOCTO = 200_000_000_000_000_000_000_000n;
/** Gas for the calls the page sends. A settle burns about 15 Tgas; the rest is returned. */
export const GAS = {
  mineDeploy: 80_000_000_000_000n,
  transferCall: 100_000_000_000_000n,
  settle: 150_000_000_000_000n,
  claim: 100_000_000_000_000n,
  claimStarter: 60_000_000_000_000n,
  register: 30_000_000_000_000n,
  openMine: 300_000_000_000_000n,
} as const;

const u128 = z.string().regex(/^\d+$/).transform((v) => BigInt(v));
const u64 = z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/).transform((v) => Number(v))]);

const mineInfoSchema = z.object({
  token: z.string(),
  mine: z.string(),
  opener: z.string(),
  opened_at: u64,
  min_stake: u128,
  max_stake: u128,
  vein_per_round: u128,
  vein_halving_seconds: u64,
});

const configSchema = z.object({
  token: z.string(),
  chip: z.string(),
  factory: z.string(),
  burn_account: z.string(),
  min_stake: u128,
  max_stake: u128,
  vein_per_round: u128,
  vein_halving_seconds: u64,
  opened_at: u64,
});

const statsSchema = z.object({
  held: u128,
  claimable_total: u128,
  vein: u128,
  pending_burn: u128,
  staked_total: u128,
  paid_total: u128,
  burned_by_burn: u128,
  burned_by_transfer: u128,
  rounds_settled: u64,
  rounds_refunded: u64,
});

const currentRoundSchema = z.object({
  id: u64,
  starts_at: u64,
  ends_at: u64,
  open: z.boolean(),
  totals: z.array(u128).length(SQUARES),
  total: u128,
  players: u64,
});

const roundSchema = z.object({
  id: u64,
  totals: z.array(u128).length(SQUARES),
  total: u128,
  players: u64,
  stakes: z.array(z.object({ player: z.string(), square: u64, amount: u128 })),
});

const summarySchema = z.object({
  round: u64,
  settled_at: u64,
  outcome: z.string(),
  winning_square: z.number().int().nullable(),
  total: u128,
  burned: u128,
  vein: u128,
  players: u64,
  winners: z.array(z.object({ player: z.string(), staked: u128, award: u128 })),
});

const chipStatsSchema = z
  .object({
    total_supply: u128,
    cap: u128,
    total_minted: u128,
    total_burned: u128,
    emission_minted: u128,
    motherlode_minted: u128,
    starter_minted: u128,
    starters_claimed: u64,
    emission_rate: u128,
    motherlode: u128,
    motherlode_hits: u64,
    rounds_reported: u64,
    launched_at: u64,
  })
  .passthrough();

const chipConfigSchema = z
  .object({ cap: u128, starter_amount: u128, starter_budget: u128, emission_per_minute: u128, halving_seconds: u64, motherlode_per_round: u128, motherlode_odds: u64, motherlode_cap: u128 })
  .passthrough();

const metadataSchema = z.object({ name: z.string(), symbol: z.string(), decimals: z.number().int().min(0).max(36), icon: z.string().nullish() }).passthrough();

export type MineInfo = z.infer<typeof mineInfoSchema>;
export type MineConfig = z.infer<typeof configSchema>;
export type MineStats = z.infer<typeof statsSchema>;
export type CurrentRound = z.infer<typeof currentRoundSchema>;
export type RoundView = z.infer<typeof roundSchema>;
export type RoundSummary = z.infer<typeof summarySchema>;
export type ChipStats = z.infer<typeof chipStatsSchema>;
export type ChipConfig = z.infer<typeof chipConfigSchema>;
export type TokenMetadata = z.infer<typeof metadataSchema>;

export class GridClient {
  readonly provider: Provider;
  readonly network: NearNetwork;

  constructor(network: NearNetwork = NEAR_NETWORKS[GRID_NETWORK_ID], provider?: Provider) {
    this.network = network;
    this.provider = provider ?? nearProvider(network);
  }

  private async view<T>(contractId: string, method: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    const raw = await this.provider.callFunction({ contractId, method, args });
    return schema.parse(raw);
  }

  async mines(): Promise<MineInfo[]> {
    return this.view(GRID_FACTORY, "get_mines", { from_index: 0, limit: 100 }, z.array(mineInfoSchema));
  }

  async mineFor(token: string): Promise<MineInfo | null> {
    return this.view(GRID_FACTORY, "get_mine", { token }, mineInfoSchema.nullable());
  }

  config(mine: string) {
    return this.view(mine, "get_config", {}, configSchema);
  }
  stats(mine: string) {
    return this.view(mine, "get_stats", {}, statsSchema);
  }
  currentRound(mine: string) {
    return this.view(mine, "get_current_round", {}, currentRoundSchema);
  }
  round(mine: string, round: number) {
    return this.view(mine, "get_round", { round: String(round) }, roundSchema.nullable());
  }
  recent(mine: string, limit = 24) {
    return this.view(mine, "get_recent", { limit }, z.array(summarySchema));
  }
  claimable(mine: string, accountId: string) {
    return this.view(mine, "get_claimable", { account_id: accountId }, u128);
  }

  chipStats() {
    return this.view(GRID_CHIP, "get_stats", {}, chipStatsSchema);
  }
  chipConfig() {
    return this.view(GRID_CHIP, "get_config", {}, chipConfigSchema);
  }
  metadata(token: string) {
    return this.view(token, "ft_metadata", {}, metadataSchema);
  }
  totalSupply(token: string) {
    return this.view(token, "ft_total_supply", {}, u128);
  }
  balance(token: string, accountId: string) {
    return this.view(token, "ft_balance_of", { account_id: accountId }, u128);
  }
  starterClaimed(accountId: string) {
    return this.view(GRID_CHIP, "has_claimed_starter", { account_id: accountId }, z.boolean());
  }
  isTokenAllowed(token: string) {
    return this.view(GRID_FACTORY, "is_token_allowed", { token }, z.boolean());
  }
  async factoryConfig() {
    return this.view(GRID_FACTORY, "get_config", {}, z.object({ mine_code_hash: z.string(), chip: z.string(), allowed_tokens: z.array(z.string()), allowed_suffixes: z.array(z.string()) }));
  }
  async mineAccountFor(token: string) {
    return this.view(GRID_FACTORY, "get_mine_account", { token }, z.string());
  }

  /** Proof read from the chain: how many access keys an account has, and the global code it runs. */
  async accountProof(accountId: string): Promise<{ keys: number; fullAccessKeys: number; globalHash: string | null; codeHash: string }> {
    const list = (await this.provider.viewAccessKeyList({ accountId })) as unknown as { keys: { access_key: { permission: unknown } }[] };
    const account = (await this.provider.viewAccount({ accountId })) as unknown as { code_hash: string; global_contract_hash?: string | null };
    return {
      keys: list.keys.length,
      fullAccessKeys: list.keys.filter((k) => k.access_key.permission === "FullAccess").length,
      globalHash: account.global_contract_hash ?? null,
      codeHash: account.code_hash,
    };
  }

  /** Every access key an account has, as plain facts: full access, or which contract and methods. */
  async keyList(accountId: string): Promise<{ publicKey: string; permission: "FullAccess" | { receiver: string; methods: string[] } }[]> {
    const list = (await this.provider.viewAccessKeyList({ accountId })) as unknown as { keys: { public_key: string; access_key: { permission: "FullAccess" | { FunctionCall: { receiver_id: string; method_names: string[] } } } }[] };
    return list.keys.map((k) => ({
      publicKey: k.public_key,
      permission: k.access_key.permission === "FullAccess" ? "FullAccess" : { receiver: k.access_key.permission.FunctionCall.receiver_id, methods: k.access_key.permission.FunctionCall.method_names },
    }));
  }

  /** The Foreman's recent recaps, newest first, read from the social contract. */
  async foremanFeed(): Promise<ForemanPost[]> {
    const raw = await this.provider.callFunction({ contractId: SOCIAL_CONTRACT, method: "get", args: { keys: [`${FOREMAN_NAMESPACE_OWNER}/kova/foreman/**`] } });
    return parseFeed(raw, FOREMAN_NAMESPACE_OWNER);
  }

  /**
   * NEP-145 (nomicon.io/Standards/StorageManagement): "unregistered" when the token does not know the
   * account, `{ total, available }` when it does, and "unsupported" when the token has no storage
   * management at all (then there is nothing to register). A named state, not null, because a page's
   * polling hook also uses null for "not read yet".
   */
  async storageBalance(token: string, accountId: string): Promise<StorageState> {
    try {
      const raw = await this.provider.callFunction({ contractId: token, method: "storage_balance_of", args: { account_id: accountId } });
      if (raw === null) return "unregistered";
      const parsed = z.object({ total: u128, available: u128 }).parse(raw);
      return { total: parsed.total, available: parsed.available };
    } catch (error) {
      if (isMissingMethod(error)) return "unsupported";
      throw error;
    }
  }

  /** What `storage_deposit` must attach to register one account with the token (its `storage_balance_bounds.min`), or null if it has none. */
  async registrationCost(token: string): Promise<bigint | null> {
    try {
      const raw = await this.provider.callFunction({ contractId: token, method: "storage_balance_bounds", args: {} });
      return z.object({ min: u128 }).parse(raw).min;
    } catch (error) {
      if (isMissingMethod(error)) return null;
      throw error;
    }
  }

  accountUrl(accountId: string) {
    return this.network.explorerAccount(accountId);
  }
}

// ------------------------------------------------------------------ pure helpers (unit-tested)

/** 1_500_000_000_000_000_000n with 18 decimals is "1.5". Trailing zeros are dropped. */
export function formatUnits(amount: bigint, decimals: number, digits = 2): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const unit = 10n ** BigInt(decimals);
  const whole = abs / unit;
  const fraction = (abs % unit).toString().padStart(decimals, "0").slice(0, digits).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}

/** "12.5" with 18 decimals is 12_500_000_000_000_000_000n. Returns null for anything that is not a plain amount. */
export function parseUnits(text: string, decimals: number): bigint | null {
  const match = /^(\d{1,30})(?:\.(\d{1,36}))?$/.exec(text.trim());
  if (!match) return null;
  const fraction = (match[2] ?? "").padEnd(decimals, "0");
  if (fraction.length > decimals && /[1-9]/.test(fraction.slice(decimals))) return null;
  return BigInt(match[1]) * 10n ** BigInt(decimals) + BigInt(fraction.slice(0, decimals) || "0");
}

/** The round a unix-seconds time falls in (one round per UTC minute). */
export const roundOf = (seconds: number) => Math.floor(seconds / 60);

/** Rows and columns of the 5x5 grid, top-left first. Squares are numbered 1 to 25 for people. */
export const squareNumber = (square: number) => square + 1;
export const squareRow = (square: number) => Math.floor(square / 5);
export const squareCol = (square: number) => square % 5;

/** "chip.kova-v3-x.testnet" -> "chip". The mine's own account id is long; people read the coin. */
export function shortAccount(accountId: string, max = 22): string {
  if (accountId.length <= max) return accountId;
  const head = accountId.slice(0, Math.ceil((max - 1) / 2));
  const tail = accountId.slice(-Math.floor((max - 1) / 2));
  return `${head}…${tail}`;
}

/** Share of the coins on one square, 0 to 1, for shading it. */
export function squareShare(totals: readonly bigint[], square: number): number {
  const total = totals.reduce((sum, v) => sum + v, 0n);
  if (total === 0n) return 0;
  return Number((totals[square] * 10_000n) / total) / 10_000;
}

/** The most the round can pay a player who wins with `stake` on a square holding `onSquare`. Estimate for display only. */
export function estimateWin(totals: readonly bigint[], square: number, stake: bigint): { award: bigint; burned: bigint } {
  const total = totals.reduce((sum, v) => sum + v, 0n) + stake;
  const onSquare = totals[square] + stake;
  const losing = total - onSquare;
  const burned = (losing * 10n) / 100n;
  const share = losing - burned;
  return { award: stake + (share * stake) / onSquare, burned };
}

/** How the mine's coins were used, for the burn bar: burned by burn plus burned by transfer. */
export const burnedTotal = (stats: MineStats) => stats.burned_by_burn + stats.burned_by_transfer;

/**
 * The call that puts `units` of a coin on a square. CHIP goes through CHIP's `mine_deploy`, which a
 * game key can sign (no deposit); any other coin is a NEP-141 `ft_transfer_call`, which needs 1
 * yoctoNEAR and therefore a full wallet signature. The page and the proof scripts both use this, so
 * what is tested is what is sent.
 */
export function stakeCall(args: { token: string; mine: string; square: number; units: bigint; round: number }): { contractId: string; method: string; args: Record<string, unknown>; gas: bigint; deposit: bigint } {
  const { token, mine, square, units, round } = args;
  if (token === GRID_CHIP) {
    return { contractId: GRID_CHIP, method: "mine_deploy", args: { mine, square, amount: units.toString(), round: String(round) }, gas: GAS.mineDeploy, deposit: 0n };
  }
  return { contractId: token, method: "ft_transfer_call", args: { receiver_id: mine, amount: units.toString(), msg: JSON.stringify({ square, round }) }, gas: GAS.transferCall, deposit: 1n };
}

/** What a person sees when the public RPC refuses for load. The call may not have been sent. */
export const RPC_BUSY = "The NEAR network connection is busy (the public RPC is rate-limiting). Wait a few seconds and try again; check the round before sending twice.";

/** NEAR reserves about 1.02 x 10^9 yoctoNEAR for every unit of gas attached (measured: 80 Tgas needs 0.0809 NEAR free). */
export const GAS_RESERVE_YOCTO_PER_GAS = 1_020_000_000n;

/** The free NEAR an account needs before it can send a call with this gas and deposit. */
export const nearNeededFor = (gas: bigint, deposit: bigint) => gas * GAS_RESERVE_YOCTO_PER_GAS + deposit;

export function lowBalanceMessage(have: bigint, need: bigint): string {
  return `This account has ${formatUnits(have, 24, 4)} NEAR free and the call needs about ${formatUnits(need, 24, 4)} NEAR set aside for gas (most of it is returned). Add testnet NEAR to the account, or let the keeper do it.`;
}

/**
 * Turns the RPC's "Not enough balance" refusal (raw yoctoNEAR) into a sentence. Anything else is
 * returned as it came. The RPC client often hides this refusal behind "Exceeded 2 providers", so the
 * session also checks the balance itself after a failed send (see lowBalanceMessage).
 */
export function friendlyFailure(detail: string): string {
  // A balance refusal wins over the generic "Exceeded N providers" wrapper that carries it.
  const match = /Not enough balance for (\S+) \(balance: (\d+), cost: (\d+)\)/.exec(detail);
  if (match) return lowBalanceMessage(BigInt(match[2]), BigInt(match[3]));
  if (/Exceeded \d+ providers|rate.?limit|\b429\b|Too Many Requests/i.test(detail)) return RPC_BUSY;
  return detail;
}

export type ForemanPost = { round: number; text: string; by: "rule" | "ai"; remark?: string; model?: string; via?: string };

const postSchema = z
  .object({ round: z.number().int().nonnegative(), text: z.string().min(1).max(400), by: z.enum(["rule", "ai"]), remark: z.string().min(1).max(200).optional(), model: z.string().max(80).optional(), via: z.enum(["brrrain", "near-ai"]).optional() })
  // A post claims an AI wrote part of it only if it names the remark and the model.
  .refine((p) => p.by === "rule" || (p.remark !== undefined && p.model !== undefined && p.via !== undefined));

/**
 * The recaps in a social-contract `get` answer ({ owner: { kova: { foreman: { r0: "<json>", ... } } } }),
 * newest first. A slot that is not valid JSON of the right shape is skipped, not shown: the Foreman
 * writes these, but anyone with the right permission could write there, so each is checked.
 */
export function parseFeed(raw: unknown, owner: string): ForemanPost[] {
  const slots = (raw as Record<string, { kova?: { foreman?: Record<string, unknown> } }> | null)?.[owner]?.kova?.foreman;
  if (!slots || typeof slots !== "object") return [];
  const posts: ForemanPost[] = [];
  for (const leaf of Object.values(slots)) {
    if (typeof leaf !== "string") continue;
    try {
      const parsed = postSchema.safeParse(JSON.parse(leaf));
      if (parsed.success) posts.push(parsed.data);
    } catch {
      // Not JSON: skip it.
    }
  }
  return posts.sort((a, b) => b.round - a.round);
}

/** True when an RPC error means "the contract has no such method", not "the network failed". */
export function isMissingMethod(error: unknown): boolean {
  const text = [(error as Error)?.message, ...(((error as { errors?: unknown[] })?.errors ?? []) as unknown[]).map((e) => (e as Error)?.message)].filter(Boolean).join(" ");
  return /MethodNotFound|MethodResolveError|method .* not found|no such method/i.test(text);
}

/**
 * A mine can only receive a standard coin once the coin has the mine registered (NEP-145). The
 * mine does not register itself, so whoever opens it (or any player) does: this builds that call.
 * `registration_only` makes the token keep exactly `min` and refund the rest.
 */
export function registrationCall(args: { token: string; mine: string; min: bigint }): { contractId: string; method: string; args: Record<string, unknown>; gas: bigint; deposit: bigint } {
  return { contractId: args.token, method: "storage_deposit", args: { account_id: args.mine, registration_only: true }, gas: GAS.register, deposit: args.min };
}

export type StorageState = "unregistered" | "unsupported" | { total: bigint; available: bigint };

/** Whether a mine still has to be registered with its coin, given what `storageBalance` said. */
export const needsRegistration = (state: StorageState) => state === "unregistered";

/** Plain decimal text for an input box: no thousands separators, trailing zeros dropped. */
export function plainUnits(amount: bigint, decimals: number): string {
  const unit = 10n ** BigInt(decimals);
  const fraction = (amount % unit).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${amount / unit}.${fraction}` : `${amount / unit}`;
}

/** The value with only its leading digit kept: 12,345 becomes 10,000. Round numbers read as chosen, not computed. */
function oneSignificantDigit(value: bigint): bigint {
  if (value <= 0n) return 0n;
  const digits = value.toString();
  return BigInt(digits[0]) * 10n ** BigInt(digits.length - 1);
}

/**
 * Stake limits to suggest for a new mine, from the coin's total supply. A mine's limits are fixed for
 * its whole life, so the suggestion is cautious: at most 0.001% of the supply per player per round
 * (never less than one whole coin), and a smallest stake 1/500th of that. Round numbers.
 */
export function suggestLimits(supply: bigint, decimals: number): { min: bigint; max: bigint } | null {
  if (supply <= 0n) return null;
  const oneCoin = 10n ** BigInt(decimals);
  let max = oneSignificantDigit(supply / 100_000n);
  if (max < oneCoin) max = oneCoin;
  let min = oneSignificantDigit(max / 500n);
  if (min < 1n) min = 1n;
  if (min > max) min = max;
  return { min, max };
}

/** Plain-words cautions about chosen limits. They warn; they never block, because the opener decides. */
export function limitWarnings(args: { min: bigint; max: bigint; supply: bigint | null; symbol: string }): string[] {
  const { min, max, supply, symbol } = args;
  const warnings: string[] = [];
  if (supply !== null && supply > 0n && max > 0n) {
    if (max * 100n > supply) warnings.push(`The most one player can stake per round is more than 1% of all ${symbol} that exist. One player could risk a large part of the coin in a single round, and this cannot be changed later.`);
    else if (max * 1_000n > supply) warnings.push(`The most one player can stake per round is more than 0.1% of all ${symbol} that exist. That is a lot for one round, and it cannot be changed later.`);
  }
  if (min > 0n && max > 0n && min * 10_000n < max) warnings.push("The smallest stake is tiny next to the largest. Very small stakes may cost more in network fees than they are worth.");
  return warnings;
}

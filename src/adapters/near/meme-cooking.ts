/**
 * meme.cooking, NEAR's memecoin launchpad, read from its public mainnet contract and its public
 * index. Kova has no partnership with meme.cooking; it reads what anyone can read.
 *
 *   Contract  meme-cooking.near (mainnet; there is no testnet deployment)
 *     get_meme {meme_id}            an auction still cooking, or one that ended and is not finalized yet
 *     get_finalized_meme {meme_id}  an auction that launched (it then has a token and a Ref pool)
 *     A failed auction is deleted when it is finalized, so it answers neither.
 *   Index     https://api.meme.cooking
 *     GET /meme   every auction with deposits, launch line (soft cap), end time, token and pool
 *     GET /info   the index's last processed block, to show how far behind it is
 *
 * The index can lag the chain by hours, so live numbers (deposits, the launch line, the end time)
 * always come from the contract. The index is used to list auctions and launches.
 */
import { z } from "zod";

export const MEME_COOKING = {
  contract: "meme-cooking.near",
  api: "https://api.meme.cooking",
  site: "https://meme.cooking",
  xHandle: "@memedotcooking",
  /** Mainnet RPC, tried in order. meme.cooking is mainnet only, while CHIP is on testnet. */
  rpcUrls: ["https://free.rpc.fastnear.com", "https://rpc.mainnet.near.org"],
} as const;

/** The token's page on meme.cooking, where it can be backed. */
export function memeUrl(id: number): string {
  return `${MEME_COOKING.site}/meme/${id}`;
}

/** wNEAR has 24 decimals, like NEAR. */
export const YOCTO_NEAR = 10n ** 24n;

export function formatNear(yocto: bigint, digits = 1): string {
  const scale = 10n ** BigInt(digits);
  const scaled = (yocto * scale) / YOCTO_NEAR;
  const whole = scaled / scale;
  const frac = scaled % scale;
  const wholeText = whole.toLocaleString("en-US");
  return digits > 0 ? `${wholeText}.${frac.toString().padStart(digits, "0")}` : wholeText;
}

const u128 = z.string().regex(/^\d+$/);

const indexedMemeSchema = z.object({
  meme_id: z.number().int().nonnegative(),
  owner: z.string(),
  name: z.string(),
  symbol: z.string(),
  end_timestamp_ms: z.number(),
  created_timestamp_ms: z.number(),
  soft_cap: u128,
  hard_cap: u128.nullable(),
  total_deposit: u128,
  is_finalized: z.boolean(),
  token_id: z.string().nullable(),
  pool_id: z.number().int().nullable(),
  staker_count: z.number().int().nullable().optional(),
});
export type IndexedMeme = z.infer<typeof indexedMemeSchema>;

const chainMemeSchema = z.object({
  id: z.number().int().nonnegative(),
  owner: z.string(),
  name: z.string(),
  symbol: z.string(),
  end_timestamp_ms: u128,
  soft_cap: u128,
  hard_cap: u128.nullable().optional(),
  total_staked: u128,
});
export type ChainMeme = z.infer<typeof chainMemeSchema>;

const infoSchema = z.object({ last_block_height: z.number(), last_seen_block_height: z.number() });

export type CookingAuction = {
  id: number;
  name: string;
  symbol: string;
  owner: string;
  /** NEAR deposited so far, in yocto. */
  raised: bigint;
  /** The launch line: the auction launches on Ref only if deposits reach it by the end. */
  softCap: bigint;
  /** Reaching it launches the token at once. */
  hardCap: bigint | null;
  endsAt: number;
  stakers: number | null;
  url: string;
};

export type LaunchedToken = {
  id: number;
  name: string;
  symbol: string;
  tokenId: string;
  poolId: number;
  raised: bigint;
  /** When its auction ended, which is when it launched. */
  launchedAt: number;
  url: string;
};

export type LaunchLobby = {
  cooking: CookingAuction[];
  launched: LaunchedToken[];
  auctionsTotal: number;
  launchesTotal: number;
  /** How many blocks meme.cooking's index is behind the chain, or null if unknown. */
  indexLagBlocks: number | null;
  readAt: number;
};

/** The state of one auction, for a "Will it cook?" table. */
export type AuctionOutcome =
  | { state: "cooking"; auction: CookingAuction }
  | { state: "cooked"; tokenId: string | null; raised: bigint; softCap: bigint }
  | { state: "flopped"; raised: bigint | null; softCap: bigint | null };

export function auctionFromChain(m: ChainMeme, stakers: number | null = null): CookingAuction {
  return {
    id: m.id,
    name: m.name,
    symbol: m.symbol,
    owner: m.owner,
    raised: BigInt(m.total_staked),
    softCap: BigInt(m.soft_cap),
    hardCap: m.hard_cap ? BigInt(m.hard_cap) : null,
    endsAt: Number(m.end_timestamp_ms),
    stakers,
    url: memeUrl(m.id),
  };
}

/**
 * How an auction stands. `live` is get_meme (null once finalized); `finalized` is
 * get_finalized_meme (null unless it launched). An auction past its end that is not finalized yet
 * is decided by its own numbers: it cooks if deposits reached the launch line.
 */
export function outcomeFrom(live: ChainMeme | null, finalized: ChainMeme | null, now: number): AuctionOutcome {
  if (finalized) return { state: "cooked", tokenId: null, raised: BigInt(finalized.total_staked), softCap: BigInt(finalized.soft_cap) };
  if (!live) return { state: "flopped", raised: null, softCap: null };
  const auction = auctionFromChain(live);
  if (auction.endsAt > now && (auction.hardCap === null || auction.raised < auction.hardCap)) return { state: "cooking", auction };
  return auction.raised >= auction.softCap ? { state: "cooked", tokenId: null, raised: auction.raised, softCap: auction.softCap } : { state: "flopped", raised: auction.raised, softCap: auction.softCap };
}

/** Parses the index's rows, skipping any that do not match rather than failing the lobby. */
export function parseIndex(rows: unknown): IndexedMeme[] {
  if (!Array.isArray(rows)) throw new Error("meme.cooking index: expected a list");
  return rows.flatMap((r) => {
    const parsed = indexedMemeSchema.safeParse(r);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * The lobby: auctions still cooking (numbers from the contract, which `live` holds by id) and the
 * latest launches (from the index). An auction the index has not seen yet but the contract has is
 * included through `live`.
 */
export function buildLobby(index: IndexedMeme[], live: Map<number, ChainMeme>, now: number, launchedLimit = 6): Omit<LaunchLobby, "indexLagBlocks" | "readAt"> {
  const stakers = new Map(index.map((m) => [m.meme_id, m.staker_count ?? null]));
  const cooking = [...live.values()]
    .map((m) => auctionFromChain(m, stakers.get(m.id) ?? null))
    .filter((a) => a.endsAt > now && (a.hardCap === null || a.raised < a.hardCap))
    .sort((a, b) => a.endsAt - b.endsAt);
  const launchedAll = index.filter((m) => m.is_finalized && m.token_id && m.pool_id !== null);
  const launched = launchedAll
    .sort((a, b) => b.end_timestamp_ms - a.end_timestamp_ms)
    .slice(0, launchedLimit)
    .map((m) => ({ id: m.meme_id, name: m.name, symbol: m.symbol, tokenId: m.token_id as string, poolId: m.pool_id as number, raised: BigInt(m.total_deposit), launchedAt: m.end_timestamp_ms, url: memeUrl(m.meme_id) }));
  return { cooking, launched, auctionsTotal: index.length, launchesTotal: launchedAll.length };
}

/** JSON for the browser: amounts as decimal strings. */
export function serializeLobby(lobby: LaunchLobby) {
  return {
    ...lobby,
    cooking: lobby.cooking.map((a) => ({ ...a, raised: a.raised.toString(), softCap: a.softCap.toString(), hardCap: a.hardCap?.toString() ?? null })),
    launched: lobby.launched.map((t) => ({ ...t, raised: t.raised.toString() })),
  };
}
export type LaunchLobbyJson = ReturnType<typeof serializeLobby>;

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export class MemeCookingReader {
  constructor(
    private readonly fetcher: Fetcher = fetch,
    private readonly rpcUrls: readonly string[] = MEME_COOKING.rpcUrls,
  ) {}

  private async view(method: string, args: object): Promise<unknown> {
    let lastError: Error = new Error("no RPC endpoint");
    for (const url of this.rpcUrls) {
      try {
        const res = await this.fetcher(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: "kova", method: "query", params: { request_type: "call_function", finality: "final", account_id: MEME_COOKING.contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") } }),
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) throw new Error(`RPC ${res.status}`);
        const body = (await res.json()) as { result?: { result?: number[]; error?: string }; error?: { message?: string } };
        if (body.result?.result) return JSON.parse(Buffer.from(body.result.result).toString("utf8"));
        // A contract panic (for example a key that does not exist) is an answer, not an outage.
        if (body.result?.error) return { panic: body.result.error };
        throw new Error(body.error?.message ?? "RPC error");
      } catch (e) {
        lastError = e as Error;
      }
    }
    throw lastError;
  }

  /** get_meme: an auction still on the contract, or null. */
  async liveMeme(id: number): Promise<ChainMeme | null> {
    const raw = await this.view("get_meme", { meme_id: id });
    if (raw === null || (typeof raw === "object" && raw && "panic" in raw)) return null;
    return chainMemeSchema.parse(raw);
  }

  /** get_finalized_meme: an auction that launched, or null. */
  async finalizedMeme(id: number): Promise<ChainMeme | null> {
    const raw = await this.view("get_finalized_meme", { meme_id: id });
    if (raw === null || (typeof raw === "object" && raw && "panic" in raw)) return null;
    return chainMemeSchema.parse(raw);
  }

  async outcome(id: number, now = Date.now()): Promise<AuctionOutcome> {
    const [live, finalized] = await Promise.all([this.liveMeme(id), this.finalizedMeme(id)]);
    return outcomeFrom(live, finalized, now);
  }

  async index(): Promise<IndexedMeme[]> {
    const res = await this.fetcher(`${MEME_COOKING.api}/meme`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`meme.cooking index ${res.status}`);
    return parseIndex(await res.json());
  }

  async indexLag(): Promise<number | null> {
    try {
      const res = await this.fetcher(`${MEME_COOKING.api}/info`, { signal: AbortSignal.timeout(8_000) });
      const info = infoSchema.parse(await res.json());
      return Math.max(0, info.last_seen_block_height - info.last_block_height);
    } catch {
      return null;
    }
  }

  /** The lobby, with every cooking auction's numbers read from the contract. */
  async lobby(now = Date.now()): Promise<LaunchLobby> {
    const [index, indexLagBlocks] = await Promise.all([this.index(), this.indexLag()]);
    const candidates = index.filter((m) => !m.is_finalized && m.end_timestamp_ms > now - 60_000).map((m) => m.meme_id);
    // Auctions newer than the index: probe the ids after the highest it knows until one is missing.
    const highest = index.reduce((max, m) => Math.max(max, m.meme_id), -1);
    const live = new Map<number, ChainMeme>();
    for (let id = highest + 1; id <= highest + 5; id++) {
      const m = await this.liveMeme(id);
      if (!m) break;
      live.set(id, m);
    }
    const rows = await Promise.all(candidates.map((id) => this.liveMeme(id)));
    for (const m of rows) if (m) live.set(m.id, m);
    return { ...buildLobby(index, live, now), indexLagBlocks, readAt: now };
  }
}

/**
 * Trade mode, devnet edition: each player trades ClawPump tokens at the live DEX Screener
 * price against a $10,000 virtual balance. Fills are simulated (no swap is sent); the ANSEM
 * stake and payout are real and go through the same on-chain escrow as Predict. At the end
 * the worker scores each trader by portfolio return (see `portfolioIndex18`).
 *
 * The server is the only place a fill is priced or recorded. The browser sends intent only.
 */
import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { applyTradeFill } from "../../domain/trading/ledger";
import type { TradingLedgerState } from "../../domain/trading/types";
import {
  SIM_DECIMALS,
  SIM_FEE_BPS,
  STARTING_CASH_MICRO_USD,
  buyFill,
  equityMicroUsd,
  movedAgainst,
  parsePrice18,
  pnlBps,
  sellFill,
  valueMicroUsd,
} from "../../domain/trading/sim";
import type { MarketFeed } from "../../adapters/game/market-feed";

export type TradingErrorCode =
  | "TABLE_NOT_FOUND" | "NOT_A_TRADING_TABLE" | "TABLE_ACCESS_DENIED" | "TABLE_FULL" | "TABLE_NOT_OPEN" | "WALLET_NOT_BOUND"
  | "NOT_IN_MATCH" | "MATCH_NOT_LIVE" | "PRICE_UNAVAILABLE" | "QUOTE_NOT_FOUND" | "QUOTE_EXPIRED" | "PRICE_MOVED"
  | "INSUFFICIENT_BALANCE" | "NO_POSITION" | "INVALID_AMOUNT" | "TRADE_NOT_FOUND";

export type TradingResult<T> = { ok: true; value: T } | { ok: false; code: TradingErrorCode; detail?: string };

const QUOTE_TTL_MS = 20_000;
const PRICE_CACHE_MS = 4_000;
const DEX_BATCH = 30;

const DexPair = z.object({
  chainId: z.string(),
  baseToken: z.object({ address: z.string(), symbol: z.string().optional() }),
  priceUsd: z.string().nullable().optional(),
  liquidity: z.object({ usd: z.number().nullable().optional() }).partial().nullable().optional(),
}).passthrough();

export interface LivePrice { price18: bigint; symbol: string }

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Commitment for a trading seat: fixed per table and wallet, since there is no secret pick. */
export function tradingCommitment(tableId: string, wallet: string) {
  return { commitment: sha256Hex(`kova-trade-v1|${tableId}|${wallet}`), sealedMarketHash: sha256Hex(`kova-trade-market-v1|${tableId}`) };
}

const toMicro = (usd: number) => BigInt(Math.round(usd * 1_000_000));

export class TradingSimService {
  private readonly prices = new Map<string, { at: number; value: LivePrice | null }>();

  constructor(private readonly deps: { pool: Pool; feed: MarketFeed; fetcher?: typeof fetch; now?: () => number }) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  /** Live prices for up to many mints, deepest Solana pair each, cached for a few seconds. */
  async livePrices(mints: readonly string[]): Promise<Map<string, LivePrice>> {
    const out = new Map<string, LivePrice>();
    const missing: string[] = [];
    for (const mint of new Set(mints)) {
      const hit = this.prices.get(mint);
      if (hit && this.now() - hit.at < PRICE_CACHE_MS) {
        if (hit.value) out.set(mint, hit.value);
      } else missing.push(mint);
    }
    const fetcher = this.deps.fetcher ?? fetch;
    for (let index = 0; index < missing.length; index += DEX_BATCH) {
      const batch = missing.slice(index, index + DEX_BATCH);
      const response = await fetcher(`https://api.dexscreener.com/tokens/v1/solana/${batch.map(encodeURIComponent).join(",")}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
      if (!response.ok) throw new Error(`DEX Screener returned HTTP ${response.status}.`);
      const pairs = z.array(DexPair).parse(await response.json());
      const best = new Map<string, z.infer<typeof DexPair>>();
      for (const pair of pairs) {
        if (pair.chainId !== "solana" || !pair.priceUsd) continue;
        const current = best.get(pair.baseToken.address);
        if (!current || (pair.liquidity?.usd ?? 0) > (current.liquidity?.usd ?? 0)) best.set(pair.baseToken.address, pair);
      }
      for (const mint of batch) {
        const pair = best.get(mint);
        let value: LivePrice | null = null;
        try {
          if (pair?.priceUsd) value = { price18: parsePrice18(pair.priceUsd), symbol: pair.baseToken.symbol ?? mint.slice(0, 4) };
        } catch {
          value = null;
        }
        this.prices.set(mint, { at: this.now(), value });
        if (value) out.set(mint, value);
      }
    }
    return out;
  }

  private async table(tableId: string) {
    const result = await this.deps.pool.query<{ id: string; host_principal_id: string; visibility: string; status: string; rules: { playerCount: number; gameMode?: string }; ends_at: Date | null }>(
      "SELECT id, host_principal_id, visibility, status, rules, ends_at FROM game_tables WHERE id = $1", [tableId],
    );
    return result.rows[0] ?? null;
  }

  /** Take a trading seat: no Dealer pick, so the seat is admitted directly and can stake at once. */
  async enter(tableId: string, principalId: string, wallet: string): Promise<TradingResult<{ wallet: string }>> {
    const table = await this.table(tableId);
    if (!table) return { ok: false, code: "TABLE_NOT_FOUND" };
    if (table.rules.gameMode !== "trading") return { ok: false, code: "NOT_A_TRADING_TABLE" };
    if (table.status !== "DRAFT" && table.status !== "OPEN") return { ok: false, code: "TABLE_NOT_OPEN" };
    if (table.visibility === "private" && table.host_principal_id !== principalId) {
      const invited = await this.deps.pool.query("SELECT 1 FROM game_invitations WHERE table_id=$1 AND claimed_by_principal_id=$2", [tableId, principalId]);
      if (invited.rowCount !== 1) return { ok: false, code: "TABLE_ACCESS_DENIED" };
    }
    const bound = await this.deps.pool.query("SELECT 1 FROM game_wallet_bindings WHERE wallet=$1 AND principal_id=$2", [wallet, principalId]);
    if (bound.rowCount !== 1) return { ok: false, code: "WALLET_NOT_BOUND" };
    const existing = await this.deps.pool.query<{ wallet: string }>("SELECT wallet FROM game_participants WHERE table_id=$1 AND principal_id=$2", [tableId, principalId]);
    if (existing.rows[0]) return { ok: true, value: { wallet: existing.rows[0].wallet } };
    const seated = await this.deps.pool.query<{ count: string }>("SELECT count(*) FROM game_participants WHERE table_id=$1", [tableId]);
    if (Number(seated.rows[0]?.count ?? 0) >= table.rules.playerCount) return { ok: false, code: "TABLE_FULL" };
    const { commitment, sealedMarketHash } = tradingCommitment(tableId, wallet);
    const client = await this.deps.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO game_participants (id, table_id, principal_id, wallet, commitment, sealed_market_hash, admission_decision, funding_status, admission_public, admission_decided_at)
         VALUES ($1,$2,$3,$4,$5,$6,'ACCEPTED','unfunded',$7,now()) ON CONFLICT DO NOTHING`,
        [randomUUID(), tableId, principalId, wallet, commitment, sealedMarketHash, { mode: "trading" }],
      );
      await client.query(
        `INSERT INTO game_trading_accounts (id, table_id, principal_id, wallet, custody, status, starting_cash_micro_usd, cash_micro_usd)
         VALUES ($1,$2,$3,$4,'user_authorized','pending',$5,$5) ON CONFLICT DO NOTHING`,
        [randomUUID(), tableId, principalId, wallet, STARTING_CASH_MICRO_USD.toString()],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    return { ok: true, value: { wallet } };
  }

  /** Called when the round activates on chain: the balances unlock for trading. */
  async activate(tableId: string): Promise<void> {
    await this.deps.pool.query("UPDATE game_trading_accounts SET status='active', updated_at=now() WHERE table_id=$1 AND status='pending'", [tableId]);
  }

  /** Funded traders' accounts in this table, for scoring. */
  private async fundedAccounts(tableId: string) {
    const result = await this.deps.pool.query<{ id: string; principal_id: string; wallet: string; cash_micro_usd: string; starting_cash_micro_usd: string }>(
      `SELECT a.id, a.principal_id, a.wallet, a.cash_micro_usd, a.starting_cash_micro_usd FROM game_trading_accounts a
       JOIN game_participants p ON p.table_id = a.table_id AND p.principal_id = a.principal_id
       WHERE a.table_id=$1 AND p.funding_status='funded'`, [tableId],
    );
    return result.rows;
  }

  private async positions(accountIds: readonly string[]) {
    if (accountIds.length === 0) return [];
    const result = await this.deps.pool.query<{ account_id: string; asset_mint: string; symbol: string | null; quantity_raw: string; cost_basis_micro_usd: string }>(
      "SELECT account_id, asset_mint, symbol, quantity_raw, cost_basis_micro_usd FROM game_trading_positions WHERE account_id = ANY($1::uuid[])", [accountIds],
    );
    return result.rows;
  }

  /**
   * Equity for every funded trader, marked at one shared set of live prices. A held token
   * with no live price is valued at zero, the same for every player.
   */
  async equities(tableId: string): Promise<Map<string, { equity: bigint; starting: bigint }>> {
    const accounts = await this.fundedAccounts(tableId);
    const held = await this.positions(accounts.map((account) => account.id));
    const marks = await this.livePrices(held.map((position) => position.asset_mint));
    const out = new Map<string, { equity: bigint; starting: bigint }>();
    for (const account of accounts) {
      const mine = held.filter((position) => position.account_id === account.id)
        .map((position) => ({ quantityRaw: BigInt(position.quantity_raw), price18: marks.get(position.asset_mint)?.price18 ?? 0n }));
      out.set(account.wallet, { equity: equityMicroUsd(BigInt(account.cash_micro_usd), mine), starting: BigInt(account.starting_cash_micro_usd) });
    }
    return out;
  }

  private async liveAccount(tableId: string, principalId: string): Promise<TradingResult<{ id: string; endsAt: Date }>> {
    const table = await this.table(tableId);
    if (!table) return { ok: false, code: "TABLE_NOT_FOUND" };
    if (table.rules.gameMode !== "trading") return { ok: false, code: "NOT_A_TRADING_TABLE" };
    if (table.status !== "ACTIVE" || !table.ends_at || this.now() >= table.ends_at.getTime()) return { ok: false, code: "MATCH_NOT_LIVE" };
    const account = await this.deps.pool.query<{ id: string }>(
      `SELECT a.id FROM game_trading_accounts a JOIN game_participants p ON p.table_id=a.table_id AND p.principal_id=a.principal_id
       WHERE a.table_id=$1 AND a.principal_id=$2 AND a.status='active' AND p.funding_status='funded'`, [tableId, principalId],
    );
    if (!account.rows[0]) return { ok: false, code: "NOT_IN_MATCH" };
    return { ok: true, value: { id: account.rows[0].id, endsAt: table.ends_at } };
  }

  async quote(principalId: string, input: { tableId: string; mint: string; side: "buy" | "sell"; inputUsd: number }) {
    if (!Number.isFinite(input.inputUsd) || input.inputUsd <= 0 || input.inputUsd > 1_000_000) return { ok: false as const, code: "INVALID_AMOUNT" as const };
    const account = await this.liveAccount(input.tableId, principalId);
    if (!account.ok) return account;
    const price = (await this.livePrices([input.mint])).get(input.mint);
    if (!price) return { ok: false as const, code: "PRICE_UNAVAILABLE" as const };
    const inputMicro = toMicro(input.inputUsd);
    let fill;
    try {
      if (input.side === "buy") {
        const cash = await this.deps.pool.query<{ cash_micro_usd: string }>("SELECT cash_micro_usd FROM game_trading_accounts WHERE id=$1", [account.value.id]);
        if (inputMicro > BigInt(cash.rows[0]!.cash_micro_usd)) return { ok: false as const, code: "INSUFFICIENT_BALANCE" as const };
        fill = buyFill(inputMicro, price.price18);
      } else {
        const held = await this.deps.pool.query<{ quantity_raw: string }>("SELECT quantity_raw FROM game_trading_positions WHERE account_id=$1 AND asset_mint=$2", [account.value.id, input.mint]);
        if (!held.rows[0]) return { ok: false as const, code: "NO_POSITION" as const };
        fill = sellFill(inputMicro, price.price18, BigInt(held.rows[0].quantity_raw));
      }
    } catch (error) {
      return { ok: false as const, code: "INVALID_AMOUNT" as const, detail: error instanceof Error ? error.message : undefined };
    }
    const id = randomUUID();
    const expiresAt = new Date(Math.min(this.now() + QUOTE_TTL_MS, account.value.endsAt.getTime()));
    await this.deps.pool.query(
      "INSERT INTO game_trading_quotes (id, account_id, side, asset_mint, symbol, input_micro_usd, price18, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [id, account.value.id, input.side, input.mint, price.symbol, inputMicro.toString(), price.price18.toString(), expiresAt],
    );
    return {
      ok: true as const,
      value: {
        id, side: input.side, mint: input.mint, symbol: price.symbol, expiresAt: expiresAt.toISOString(), inputMicroUsd: inputMicro.toString(),
        quantityRaw: fill.quantityRaw.toString(), quoteMicroUsd: fill.quoteMicroUsd.toString(), feeMicroUsd: fill.feeMicroUsd.toString(), price18: price.price18.toString(),
      },
    };
  }

  /** Fill a quote at the live price. Refused if the price moved more than 2% against the player. */
  async execute(principalId: string, quoteId: string): Promise<TradingResult<ReturnType<TradingSimService["tradeDto"]>>> {
    const quoteRow = await this.deps.pool.query<{ id: string; account_id: string; side: "buy" | "sell"; asset_mint: string; symbol: string; input_micro_usd: string; price18: string; expires_at: Date; fill_id: string | null; table_id: string; principal_id: string }>(
      `SELECT q.id, q.account_id, q.side, q.asset_mint, q.symbol, q.input_micro_usd, q.price18, q.expires_at, q.fill_id, a.table_id, a.principal_id
       FROM game_trading_quotes q JOIN game_trading_accounts a ON a.id = q.account_id WHERE q.id=$1`, [quoteId],
    );
    const quote = quoteRow.rows[0];
    if (!quote || quote.principal_id !== principalId) return { ok: false, code: "QUOTE_NOT_FOUND" };
    if (quote.fill_id) return this.trade(principalId, quote.fill_id);
    if (this.now() > quote.expires_at.getTime()) return { ok: false, code: "QUOTE_EXPIRED" };
    const live = await this.liveAccount(quote.table_id, principalId);
    if (!live.ok) return live;
    this.prices.delete(quote.asset_mint);
    const price = (await this.livePrices([quote.asset_mint])).get(quote.asset_mint);
    if (!price) return { ok: false, code: "PRICE_UNAVAILABLE" };
    if (movedAgainst(quote.side, BigInt(quote.price18), price.price18)) return { ok: false, code: "PRICE_MOVED" };

    const client = await this.deps.pool.connect();
    try {
      await client.query("BEGIN");
      const fillId = await this.applyFill(client, quote, price);
      await client.query("COMMIT");
      return this.trade(principalId, fillId);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof TradingRefusal) return { ok: false, code: error.code, detail: error.message };
      throw error;
    } finally {
      client.release();
    }
  }

  private async applyFill(client: PoolClient, quote: { id: string; account_id: string; side: "buy" | "sell"; asset_mint: string; symbol: string; input_micro_usd: string; table_id: string; principal_id: string }, price: LivePrice): Promise<string> {
    // Lock the account row so two fills for one player can't race the balance.
    const accountRow = await client.query<{ cash_micro_usd: string; starting_cash_micro_usd: string; realized_pnl_micro_usd: string }>(
      "SELECT cash_micro_usd, starting_cash_micro_usd, realized_pnl_micro_usd FROM game_trading_accounts WHERE id=$1 FOR UPDATE", [quote.account_id],
    );
    const lockedQuote = await client.query<{ fill_id: string | null }>("SELECT fill_id FROM game_trading_quotes WHERE id=$1 FOR UPDATE", [quote.id]);
    if (lockedQuote.rows[0]?.fill_id) return lockedQuote.rows[0].fill_id;
    const account = accountRow.rows[0]!;
    const positions = await client.query<{ asset_mint: string; asset_decimals: number; quantity_raw: string; cost_basis_micro_usd: string }>(
      "SELECT asset_mint, asset_decimals, quantity_raw, cost_basis_micro_usd FROM game_trading_positions WHERE account_id=$1", [quote.account_id],
    );
    const held = positions.rows.find((row) => row.asset_mint === quote.asset_mint);
    const inputMicro = BigInt(quote.input_micro_usd);
    let fill;
    try {
      fill = quote.side === "buy" ? buyFill(inputMicro, price.price18) : sellFill(inputMicro, price.price18, BigInt(held?.quantity_raw ?? "0"));
    } catch (error) {
      throw new TradingRefusal(quote.side === "sell" && !held ? "NO_POSITION" : "INVALID_AMOUNT", error instanceof Error ? error.message : "");
    }
    const state: TradingLedgerState = {
      competitionId: quote.table_id, playerId: quote.principal_id, accountId: quote.account_id,
      startingCashMicroUsd: account.starting_cash_micro_usd, cashMicroUsd: account.cash_micro_usd, realizedPnlMicroUsd: account.realized_pnl_micro_usd,
      positions: positions.rows.map((row) => ({ assetMint: row.asset_mint, assetDecimals: row.asset_decimals, quantityRaw: row.quantity_raw, costBasisMicroUsd: row.cost_basis_micro_usd })),
      fills: [],
    };
    const fillId = randomUUID();
    const observedAt = new Date(this.now()).toISOString();
    let next: TradingLedgerState;
    try {
      next = applyTradeFill(state, {
        fillId, competitionId: quote.table_id, playerId: quote.principal_id, accountId: quote.account_id, txSignature: `sim:${fillId}`,
        side: quote.side, assetMint: quote.asset_mint, assetDecimals: SIM_DECIMALS, quantityRaw: fill.quantityRaw.toString(),
        quoteAmountMicroUsd: fill.quoteMicroUsd.toString(), feeMicroUsd: fill.feeMicroUsd.toString(), observedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      throw new TradingRefusal(/cash/i.test(message) ? "INSUFFICIENT_BALANCE" : /held|position/i.test(message) ? "NO_POSITION" : "INVALID_AMOUNT", message);
    }
    await client.query("UPDATE game_trading_accounts SET cash_micro_usd=$2, realized_pnl_micro_usd=$3, updated_at=now() WHERE id=$1", [quote.account_id, next.cashMicroUsd, next.realizedPnlMicroUsd]);
    const after = next.positions.find((position) => position.assetMint === quote.asset_mint);
    if (after) {
      await client.query(
        `INSERT INTO game_trading_positions (account_id, asset_mint, asset_decimals, quantity_raw, cost_basis_micro_usd, symbol) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (account_id, asset_mint) DO UPDATE SET quantity_raw=EXCLUDED.quantity_raw, cost_basis_micro_usd=EXCLUDED.cost_basis_micro_usd, symbol=EXCLUDED.symbol, updated_at=now()`,
        [quote.account_id, quote.asset_mint, SIM_DECIMALS, after.quantityRaw, after.costBasisMicroUsd, quote.symbol],
      );
    } else {
      await client.query("DELETE FROM game_trading_positions WHERE account_id=$1 AND asset_mint=$2", [quote.account_id, quote.asset_mint]);
    }
    await client.query(
      `INSERT INTO game_trading_fills (id, account_id, tx_signature, side, asset_mint, asset_decimals, quantity_raw, quote_amount_micro_usd, fee_micro_usd, observed_at, source, price18, symbol)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'simulated',$11,$12)`,
      [fillId, quote.account_id, `sim:${fillId}`, quote.side, quote.asset_mint, SIM_DECIMALS, fill.quantityRaw.toString(), fill.quoteMicroUsd.toString(), fill.feeMicroUsd.toString(), observedAt, price.price18.toString(), quote.symbol],
    );
    await client.query("UPDATE game_trading_quotes SET fill_id=$2 WHERE id=$1", [quote.id, fillId]);
    return fillId;
  }

  private tradeDto(row: { id: string; table_id: string; side: string; asset_mint: string; symbol: string | null; quantity_raw: string; quote_amount_micro_usd: string; fee_micro_usd: string; price18: string | null; observed_at: Date }) {
    return {
      id: row.id, tableId: row.table_id, side: row.side as "buy" | "sell", mint: row.asset_mint, symbol: row.symbol ?? row.asset_mint.slice(0, 4),
      quantityRaw: row.quantity_raw, quoteMicroUsd: row.quote_amount_micro_usd, feeMicroUsd: row.fee_micro_usd, price18: row.price18,
      at: row.observed_at.toISOString(), status: "confirmed" as const,
    };
  }

  async trade(principalId: string, fillId: string): Promise<TradingResult<ReturnType<TradingSimService["tradeDto"]>>> {
    const row = await this.deps.pool.query<Parameters<TradingSimService["tradeDto"]>[0] & { principal_id: string }>(
      `SELECT f.id, a.table_id, a.principal_id, f.side, f.asset_mint, f.symbol, f.quantity_raw, f.quote_amount_micro_usd, f.fee_micro_usd, f.price18, f.observed_at
       FROM game_trading_fills f JOIN game_trading_accounts a ON a.id=f.account_id WHERE f.id=$1`, [fillId],
    );
    const found = row.rows[0];
    if (!found || found.principal_id !== principalId) return { ok: false, code: "TRADE_NOT_FOUND" };
    return { ok: true, value: this.tradeDto(found) };
  }

  /** Everything the trading screen shows. Other players are visible only as wallet and PnL. */
  async matchState(tableId: string, principalId: string | null) {
    const table = await this.table(tableId);
    if (!table) return { ok: false as const, code: "TABLE_NOT_FOUND" as const };
    if (table.rules.gameMode !== "trading") return { ok: false as const, code: "NOT_A_TRADING_TABLE" as const };
    const all = await this.deps.pool.query<{ id: string; principal_id: string; wallet: string; cash_micro_usd: string; starting_cash_micro_usd: string; status: string; funding_status: string }>(
      `SELECT a.id, a.principal_id, a.wallet, a.cash_micro_usd, a.starting_cash_micro_usd, a.status, p.funding_status FROM game_trading_accounts a
       JOIN game_participants p ON p.table_id=a.table_id AND p.principal_id=a.principal_id WHERE a.table_id=$1`, [tableId],
    );
    const held = await this.positions(all.rows.map((row) => row.id));
    const [marks, trending] = await Promise.all([
      this.livePrices(held.map((position) => position.asset_mint)).catch(() => new Map<string, LivePrice>()),
      this.deps.feed.list({ sort: "trending", limit: 40 }).catch(() => ({ assets: [] })),
    ]);
    const mine = all.rows.find((row) => row.principal_id === principalId) ?? null;
    const valued = (accountId: string) => held.filter((position) => position.account_id === accountId).map((position) => {
      const price18 = marks.get(position.asset_mint)?.price18 ?? null;
      return {
        mint: position.asset_mint, symbol: position.symbol ?? position.asset_mint.slice(0, 4), quantityRaw: position.quantity_raw,
        costBasisMicroUsd: position.cost_basis_micro_usd, price18: price18?.toString() ?? null,
        valueMicroUsd: price18 === null ? null : valueMicroUsd(BigInt(position.quantity_raw), price18).toString(),
      };
    });
    const equityOf = (row: (typeof all.rows)[number]) => equityMicroUsd(BigInt(row.cash_micro_usd), held.filter((position) => position.account_id === row.id)
      .map((position) => ({ quantityRaw: BigInt(position.quantity_raw), price18: marks.get(position.asset_mint)?.price18 ?? 0n })));
    const standings = all.rows.filter((row) => row.funding_status === "funded").map((row) => {
      const equity = equityOf(row);
      return { wallet: row.wallet, equityMicroUsd: equity.toString(), pnlBps: pnlBps(equity, BigInt(row.starting_cash_micro_usd)).toString(), isViewer: row.principal_id === principalId };
    }).sort((left, right) => Number(BigInt(right.pnlBps) - BigInt(left.pnlBps)));
    let fills: ReturnType<TradingSimService["tradeDto"]>[] = [];
    if (mine) {
      const rows = await this.deps.pool.query<Parameters<TradingSimService["tradeDto"]>[0]>(
        `SELECT f.id, a.table_id, f.side, f.asset_mint, f.symbol, f.quantity_raw, f.quote_amount_micro_usd, f.fee_micro_usd, f.price18, f.observed_at
         FROM game_trading_fills f JOIN game_trading_accounts a ON a.id=f.account_id WHERE f.account_id=$1 ORDER BY f.observed_at DESC LIMIT 100`, [mine.id],
      );
      fills = rows.rows.map((row) => this.tradeDto(row));
    }
    const heldMints = mine ? held.filter((position) => position.account_id === mine.id).map((position) => position.asset_mint) : [];
    const eligible = [...new Set([...heldMints, ...trending.assets.filter((asset) => asset.priceUsd !== null).map((asset) => asset.mint)])];
    const live = table.status === "ACTIVE" && table.ends_at !== null && this.now() < table.ends_at.getTime();
    return {
      ok: true as const,
      value: {
        tableId, simulated: true, feeBps: Number(SIM_FEE_BPS), live, endsAt: table.ends_at?.toISOString() ?? null,
        account: mine ? {
          status: mine.status, cashMicroUsd: mine.cash_micro_usd, startingCashMicroUsd: mine.starting_cash_micro_usd,
          equityMicroUsd: equityOf(mine).toString(), pnlBps: pnlBps(equityOf(mine), BigInt(mine.starting_cash_micro_usd)).toString(),
          positions: valued(mine.id),
        } : null,
        fills, standings, eligibleMints: eligible,
      },
    };
  }
}

class TradingRefusal extends Error {
  constructor(readonly code: TradingErrorCode, message: string) {
    super(message);
  }
}

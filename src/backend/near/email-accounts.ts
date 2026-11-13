/**
 * Starting NEAR for email accounts.
 *
 * A Privy email wallet is a NEAR implicit account, and an implicit account does not exist on chain
 * until it receives NEAR. Kova sends each new email account a small amount of testnet NEAR from a
 * sponsor account so it can add its game key and play. Rules:
 *
 * - The caller proves the Privy login (an access token Kova verifies with Privy) and control of the
 *   account (its own signature over a message naming that login, see `fundingMessage`).
 * - One funding per Privy login, ever, and a daily cap across all logins.
 * - The intent is recorded before the transfer, so a crash or a retry never pays twice. A failed
 *   transfer removes its record so the player can try again.
 * - An account that already holds enough NEAR is recorded and not paid.
 */
import type { Account, Provider } from "near-api-js";
import type { Pool } from "pg";
import { isImplicitAccount, verifyFundingProof } from "../../adapters/near/email-wallet";

export type FundingRecord = { privyUserId: string; accountId: string; amount: bigint; txHash: string | null; createdAt: Date };

export interface EmailFundingStore {
  /** Records the intent. Returns the existing row instead when this login was already funded or is being funded. */
  reserve(row: { privyUserId: string; accountId: string; amount: bigint }): Promise<{ created: true } | { created: false; existing: FundingRecord }>;
  complete(privyUserId: string, txHash: string | null): Promise<void>;
  release(privyUserId: string): Promise<void>;
  countSince(since: Date): Promise<number>;
}

export class MemoryEmailFundingStore implements EmailFundingStore {
  readonly rows = new Map<string, FundingRecord>();

  constructor(private readonly clock: () => Date = () => new Date()) {}

  async reserve(row: { privyUserId: string; accountId: string; amount: bigint }) {
    const existing = this.rows.get(row.privyUserId);
    if (existing) return { created: false as const, existing };
    if ([...this.rows.values()].some((r) => r.accountId === row.accountId)) {
      return { created: false as const, existing: [...this.rows.values()].find((r) => r.accountId === row.accountId) as FundingRecord };
    }
    this.rows.set(row.privyUserId, { ...row, txHash: null, createdAt: this.clock() });
    return { created: true as const };
  }

  async complete(privyUserId: string, txHash: string | null) {
    const row = this.rows.get(privyUserId);
    if (row) row.txHash = txHash;
  }

  async release(privyUserId: string) {
    this.rows.delete(privyUserId);
  }

  async countSince(since: Date) {
    return [...this.rows.values()].filter((r) => r.createdAt >= since).length;
  }
}

export class PostgresEmailFundingStore implements EmailFundingStore {
  constructor(private readonly pool: Pool) {}

  async reserve(row: { privyUserId: string; accountId: string; amount: bigint }) {
    const inserted = await this.pool.query(
      "INSERT INTO near_email_accounts (privy_user_id, account_id, amount_yocto) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [row.privyUserId, row.accountId, row.amount.toString()],
    );
    if ((inserted.rowCount ?? 0) > 0) return { created: true as const };
    const found = await this.pool.query<{ privy_user_id: string; account_id: string; amount_yocto: string; tx_hash: string | null; created_at: Date }>(
      "SELECT privy_user_id, account_id, amount_yocto, tx_hash, created_at FROM near_email_accounts WHERE privy_user_id = $1 OR account_id = $2 LIMIT 1",
      [row.privyUserId, row.accountId],
    );
    const r = found.rows[0];
    if (!r) throw new Error("Funding record conflict without a row.");
    return { created: false as const, existing: { privyUserId: r.privy_user_id, accountId: r.account_id, amount: BigInt(r.amount_yocto), txHash: r.tx_hash, createdAt: r.created_at } };
  }

  async complete(privyUserId: string, txHash: string | null) {
    await this.pool.query("UPDATE near_email_accounts SET tx_hash = $2, funded_at = now() WHERE privy_user_id = $1", [privyUserId, txHash]);
  }

  async release(privyUserId: string) {
    await this.pool.query("DELETE FROM near_email_accounts WHERE privy_user_id = $1 AND funded_at IS NULL", [privyUserId]);
  }

  async countSince(since: Date) {
    const result = await this.pool.query<{ n: string }>("SELECT count(*)::text AS n FROM near_email_accounts WHERE created_at >= $1", [since]);
    return Number(result.rows[0]?.n ?? 0);
  }
}

export type FundOutcome =
  | { ok: true; accountId: string; funded: boolean; txHash: string | null; explorerUrl: string | null }
  | { ok: false; status: 400 | 401 | 403 | 409 | 429 | 502; code: string; message: string };

export type EmailFundingDeps = {
  verifyToken: (token: string) => Promise<{ userId: string } | null>;
  sponsor: Pick<Account, "accountId" | "transfer">;
  provider: Pick<Provider, "viewAccount">;
  store: EmailFundingStore;
  network: string;
  contractId: string;
  amount: bigint;
  dailyCap: number;
  explorerTx: (hash: string) => string;
  clock?: () => Date;
};

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function balanceOf(provider: Pick<Provider, "viewAccount">, accountId: string): Promise<bigint | null> {
  try {
    const view = (await provider.viewAccount({ accountId })) as unknown as { amount: string | bigint };
    return BigInt(view.amount);
  } catch {
    return null; // an implicit account that has never received NEAR does not exist yet
  }
}

function txHashOf(outcome: unknown): string | null {
  const o = outcome as { transaction?: { hash?: string }; transaction_outcome?: { id?: string } } | null;
  return o?.transaction?.hash ?? o?.transaction_outcome?.id ?? null;
}

export class EmailAccountFunder {
  constructor(private readonly deps: EmailFundingDeps) {}

  async fund(input: { token: string | null; accountId: string; signature: string }): Promise<FundOutcome> {
    const d = this.deps;
    if (!input.token) return { ok: false, status: 401, code: "SIGN_IN", message: "Sign in with email first." };
    const user = await d.verifyToken(input.token).catch(() => null);
    if (!user) return { ok: false, status: 401, code: "SIGN_IN", message: "Your email sign-in has expired. Sign in again." };
    if (!isImplicitAccount(input.accountId)) return { ok: false, status: 400, code: "ACCOUNT", message: "That is not an email wallet account." };
    const proof = { privyUserId: user.userId, accountId: input.accountId, network: d.network, contractId: d.contractId, signature: input.signature };
    if (!(await verifyFundingProof(proof))) return { ok: false, status: 403, code: "PROOF", message: "The account's signature did not check out." };

    const balance = await balanceOf(d.provider, input.accountId);
    const enough = balance !== null && balance >= d.amount / 2n;

    const now = (d.clock ?? (() => new Date()))();
    if (!enough && (await d.store.countSince(startOfUtcDay(now))) >= d.dailyCap) {
      return { ok: false, status: 429, code: "DAILY_CAP", message: "Kova has funded as many new email accounts as it can today. Try again after 00:00 UTC, or connect a wallet." };
    }

    const reserved = await d.store.reserve({ privyUserId: user.userId, accountId: input.accountId, amount: enough ? 0n : d.amount });
    if (!reserved.created) {
      const existing = reserved.existing;
      if (existing.accountId !== input.accountId || existing.privyUserId !== user.userId) {
        return { ok: false, status: 409, code: "ALREADY", message: "This email login, or this account, was already set up with another pairing." };
      }
      // A transfer that was reserved but never landed (the server stopped mid-way): the chain shows no
      // NEAR, so send it now. Waiting two minutes first keeps a second click from paying twice while
      // the first transfer is still in flight.
      const stalled = existing.amount > 0n && existing.txHash === null && !enough && now.getTime() - existing.createdAt.getTime() > 120_000;
      if (!stalled) return { ok: true, accountId: input.accountId, funded: false, txHash: existing.txHash, explorerUrl: existing.txHash ? d.explorerTx(existing.txHash) : null };
      return this.transfer(user.userId, input.accountId, false);
    }

    if (enough) {
      await d.store.complete(user.userId, null);
      return { ok: true, accountId: input.accountId, funded: false, txHash: null, explorerUrl: null };
    }

    return this.transfer(user.userId, input.accountId, true);
  }

  private async transfer(privyUserId: string, accountId: string, releaseOnFailure: boolean): Promise<FundOutcome> {
    const d = this.deps;
    try {
      const outcome = await d.sponsor.transfer({ receiverId: accountId, amount: d.amount });
      const hash = txHashOf(outcome);
      await d.store.complete(privyUserId, hash);
      return { ok: true, accountId, funded: true, txHash: hash, explorerUrl: hash ? d.explorerTx(hash) : null };
    } catch (e) {
      if (releaseOnFailure) await d.store.release(privyUserId);
      console.warn(JSON.stringify({ event: "near_email_funding", step: "transfer_failed", account: accountId, message: (e as Error).message }));
      return { ok: false, status: 502, code: "TRANSFER", message: "Kova could not send the starting NEAR just now. Try again in a minute." };
    }
  }
}

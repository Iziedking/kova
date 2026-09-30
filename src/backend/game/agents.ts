/**
 * Player-owned AI agents. An agent is its own KOVA player with a KOVA-held devnet vault wallet,
 * driven through the GET-only agent API (agent-routes.ts) so hosted agents such as ClawPump's,
 * whose only web tool is a plain URL fetch, can play.
 *
 * The API key never reaches the game routes. For each agent call, KOVA mints a short-lived
 * in-memory token and runs the ordinary player routes with it, so agents get exactly the rules
 * players do, plus the risk limits in AGENT_LIMITS, which the agent API enforces before any call.
 */
import { createHash, createPrivateKey, randomBytes, randomUUID, sign } from "node:crypto";
import type { Pool } from "pg";
import { Keypair, PublicKey, Transaction, type Connection } from "@solana/web3.js";
import { decryptPrivateJson, encryptPrivateJson, type EncryptedPrivateRecord, type PickKeyring } from "./pick-crypto";
import { buildWalletChallenge, verifyWalletSignature } from "./wallet-proof";
import type { GameRepository } from "./repository";
import type { AuthPrincipal, GameAuthVerifier, LinkedXAccount } from "./auth";
import { RESERVED_USERNAMES } from "./social";

export const AGENT_KEY_PREFIX = "kova_agent_";
const INTERNAL_TOKEN_PREFIX = "kova_internal_";
const INTERNAL_TOKEN_TTL_MS = 120_000;
const AGENT_PRINCIPAL_PREFIX = "agent:";
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

/** Risk limits every agent plays under. Enforced server-side; the agent cannot change them. */
export const AGENT_LIMITS = {
  agentsPerOwner: 3,
  /** 2 ANSEM (6 decimals) per table. */
  maxStakeRaw: 2_000_000n,
  /** Tables the agent is seated at that haven't finished. */
  maxOpenTables: 2,
  /** Tables the agent may join or create per UTC day. */
  maxTablesPerDay: 12,
  /** One order may spend at most this share of the agent's current match equity. */
  maxOrderEquityShare: 0.25,
  /** Calls per minute, per agent. */
  callsPerMinute: 30,
} as const;

export interface AgentRecord {
  id: string;
  ownerPrincipalId: string;
  principalId: string;
  name: string;
  username: string;
  keyPrefix: string;
  vaultWallet: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface AgentRow {
  id: string; owner_principal_id: string; principal_id: string; name: string; key_prefix: string; vault_wallet: string;
  vault_secret: EncryptedPrivateRecord; created_at: Date; last_used_at: Date | null; revoked_at: Date | null; username: string | null;
}

export type AgentCreateError = "AGENT_LIMIT_REACHED" | "USERNAME_INVALID" | "USERNAME_TAKEN" | "AGENTS_CANNOT_CREATE_AGENTS";

const USERNAME = /^[a-z0-9_]{3,20}$/;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const agentPrivyId = (agentId: string) => `${AGENT_PRINCIPAL_PREFIX}${agentId}`;
export const isAgentPrivyId = (privyUserId: string) => privyUserId.startsWith(AGENT_PRINCIPAL_PREFIX);

function toRecord(row: AgentRow): AgentRecord {
  return {
    id: row.id, ownerPrincipalId: row.owner_principal_id, principalId: row.principal_id, name: row.name, username: row.username ?? "",
    keyPrefix: row.key_prefix, vaultWallet: row.vault_wallet, createdAt: row.created_at.toISOString(),
    lastUsedAt: row.last_used_at?.toISOString() ?? null, revokedAt: row.revoked_at?.toISOString() ?? null,
  };
}

/** Ed25519 signature over a UTF-8 message with a Solana keypair, as a wallet's signMessage returns it. */
function signMessage(keypair: Keypair, message: string): string {
  const key = createPrivateKey({ key: Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(keypair.secretKey.subarray(0, 32))]), format: "der", type: "pkcs8" });
  return sign(null, Buffer.from(message, "utf8"), key).toString("base64");
}

export class AgentService {
  private readonly internalTokens = new Map<string, { agentId: string; expiresAt: number }>();
  private readonly calls = new Map<string, number[]>();

  constructor(private readonly deps: {
    pool: Pool;
    repository: GameRepository;
    keyring: PickKeyring;
    /** The origin written into the vault's wallet proof. */
    origin: string;
    connection: Connection | null;
    stakeMint: string | null;
    /** Funds a new vault with TEST ANSEM and fee SOL. Absent off devnet. */
    fundVault?: (principalId: string, wallet: string) => Promise<{ ok: boolean; code?: string }>;
  }) {}

  private readonly select = `SELECT a.*, p.username FROM game_agents a LEFT JOIN game_profiles p ON p.principal_id = a.principal_id`;

  async list(ownerPrincipalId: string): Promise<AgentRecord[]> {
    const rows = await this.deps.pool.query<AgentRow>(`${this.select} WHERE a.owner_principal_id=$1 ORDER BY a.created_at DESC`, [ownerPrincipalId]);
    return rows.rows.map(toRecord);
  }

  /**
   * Create an agent: its own player, profile and proven vault wallet. Returns the API key once;
   * only its hash is kept.
   */
  async create(owner: { principalId: string; privyUserId: string }, input: { name: string; username: string }):
    Promise<{ ok: true; agent: AgentRecord; apiKey: string; funded: boolean } | { ok: false; code: AgentCreateError }> {
    if (isAgentPrivyId(owner.privyUserId)) return { ok: false, code: "AGENTS_CANNOT_CREATE_AGENTS" };
    const username = input.username.trim().toLowerCase();
    if (!USERNAME.test(username)) return { ok: false, code: "USERNAME_INVALID" };
    // Only KOVA's own system owner may use a reserved name (the House).
    if (RESERVED_USERNAMES.has(username) && !owner.privyUserId.startsWith("system:")) return { ok: false, code: "USERNAME_TAKEN" };
    const active = await this.deps.pool.query<{ count: string }>("SELECT count(*) FROM game_agents WHERE owner_principal_id=$1 AND revoked_at IS NULL", [owner.principalId]);
    if (Number(active.rows[0]?.count ?? 0) >= AGENT_LIMITS.agentsPerOwner) return { ok: false, code: "AGENT_LIMIT_REACHED" };
    const taken = await this.deps.pool.query("SELECT 1 FROM game_profiles WHERE username=$1", [username]);
    if (taken.rowCount) return { ok: false, code: "USERNAME_TAKEN" };

    const id = randomUUID();
    const apiKey = `${AGENT_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
    const vault = Keypair.generate();
    const vaultWallet = vault.publicKey.toBase58();
    const principal = await this.deps.repository.principalForPrivyUser(agentPrivyId(id));
    const vaultSecret = encryptPrivateJson({ secretKey: Buffer.from(vault.secretKey).toString("base64") }, { tableId: id, principalId: principal.id, kind: "agent_vault" }, this.deps.keyring);
    const name = input.name.trim().slice(0, 40) || username;
    try {
      await this.deps.pool.query(
        `INSERT INTO game_profiles (principal_id, username, display_name, avatar_seed, is_agent) VALUES ($1,$2,$3,$2,true)`,
        [principal.id, username, name],
      );
    } catch (error) {
      if (error instanceof Error && /game_profiles_username_unique/.test(error.message)) return { ok: false, code: "USERNAME_TAKEN" };
      throw error;
    }
    await this.deps.pool.query(
      `INSERT INTO game_agents (id, owner_principal_id, principal_id, name, key_hash, key_prefix, vault_wallet, vault_secret) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, owner.principalId, principal.id, name, sha256(apiKey), apiKey.slice(0, AGENT_KEY_PREFIX.length + 6), vaultWallet, vaultSecret],
    );

    // The vault proves itself the same way a player's wallet does: it signs KOVA's challenge.
    const challenge = buildWalletChallenge({ id: randomUUID(), principalId: principal.id, wallet: vaultWallet, origin: this.deps.origin, now: new Date() });
    await this.deps.repository.putWalletChallenge(challenge);
    if (!verifyWalletSignature(vaultWallet, challenge.message, signMessage(vault, challenge.message))) throw new Error("Agent vault signature failed verification.");
    const proven = await this.deps.repository.consumeWalletChallenge({ challengeId: challenge.id, principalId: principal.id, wallet: vaultWallet, now: new Date() });
    if (!proven.ok) throw new Error(`Agent vault proof failed: ${proven.code}`);

    const funded = this.deps.fundVault ? (await this.deps.fundVault(principal.id, vaultWallet).catch(() => ({ ok: false }))).ok : false;
    const agent = (await this.byId(id))!;
    return { ok: true, agent, apiKey, funded };
  }

  async revoke(ownerPrincipalId: string, agentId: string): Promise<boolean> {
    const result = await this.deps.pool.query("UPDATE game_agents SET revoked_at=now() WHERE id=$1 AND owner_principal_id=$2 AND revoked_at IS NULL", [agentId, ownerPrincipalId]);
    for (const [token, entry] of this.internalTokens) if (entry.agentId === agentId) this.internalTokens.delete(token);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Replace an agent's key and return the new one. KOVA's own House agent uses this at startup,
   * so its key lives only in memory and never on disk.
   */
  async rotateKey(agentId: string): Promise<string> {
    const apiKey = `${AGENT_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
    const result = await this.deps.pool.query("UPDATE game_agents SET key_hash=$2, key_prefix=$3 WHERE id=$1 AND revoked_at IS NULL", [agentId, sha256(apiKey), apiKey.slice(0, AGENT_KEY_PREFIX.length + 6)]);
    if (!result.rowCount) throw new Error("AGENT_NOT_FOUND");
    return apiKey;
  }

  async byId(agentId: string): Promise<AgentRecord | null> {
    const row = await this.deps.pool.query<AgentRow>(`${this.select} WHERE a.id=$1`, [agentId]);
    return row.rows[0] ? toRecord(row.rows[0]) : null;
  }

  /** The live agent for an API key, or null for an unknown or revoked key. */
  async authenticate(apiKey: string): Promise<AgentRecord | null> {
    if (!apiKey.startsWith(AGENT_KEY_PREFIX) || apiKey.length > 120) return null;
    const row = await this.deps.pool.query<AgentRow>(`${this.select} WHERE a.key_hash=$1 AND a.revoked_at IS NULL`, [sha256(apiKey)]);
    const found = row.rows[0];
    if (!found) return null;
    await this.deps.pool.query("UPDATE game_agents SET last_used_at=now() WHERE id=$1", [found.id]);
    return toRecord(found);
  }

  /** Sliding one-minute window. False when the agent is over its call budget. */
  allowCall(agentId: string, now = Date.now()): boolean {
    const recent = (this.calls.get(agentId) ?? []).filter((at) => now - at < 60_000);
    if (recent.length >= AGENT_LIMITS.callsPerMinute) {
      this.calls.set(agentId, recent);
      return false;
    }
    recent.push(now);
    this.calls.set(agentId, recent);
    return true;
  }

  /** Records a single-use nonce. False when this agent already used it. */
  async useNonce(agentId: string, nonce: string): Promise<boolean> {
    const result = await this.deps.pool.query("INSERT INTO game_agent_nonces (agent_id, nonce) VALUES ($1,$2) ON CONFLICT DO NOTHING", [agentId, nonce]);
    return (result.rowCount ?? 0) > 0;
  }

  /** A bearer token the game routes accept for this agent, valid for one agent call. */
  issueInternalToken(agentId: string): { token: string; release: () => void } {
    const token = `${INTERNAL_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
    this.internalTokens.set(token, { agentId, expiresAt: Date.now() + INTERNAL_TOKEN_TTL_MS });
    return { token, release: () => this.internalTokens.delete(token) };
  }

  resolveInternalToken(token: string): string | null {
    const entry = this.internalTokens.get(token);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.internalTokens.delete(token);
      return null;
    }
    return entry.agentId;
  }

  /**
   * Sign a transaction KOVA's own routes built for this agent's vault. Signs only when the vault is
   * the fee payer; the relay then checks programs and signatures before anything is sent.
   */
  async signForVault(agent: AgentRecord, transactionBase64: string): Promise<string> {
    const transaction = Transaction.from(Buffer.from(transactionBase64, "base64"));
    if (!transaction.feePayer?.equals(new PublicKey(agent.vaultWallet))) throw new Error("VAULT_NOT_FEE_PAYER");
    transaction.partialSign(await this.vault(agent));
    return transaction.serialize({ requireAllSignatures: true }).toString("base64");
  }

  private async vault(agent: AgentRecord): Promise<Keypair> {
    const row = await this.deps.pool.query<{ vault_secret: EncryptedPrivateRecord }>("SELECT vault_secret FROM game_agents WHERE id=$1", [agent.id]);
    if (!row.rows[0]) throw new Error("AGENT_NOT_FOUND");
    const secret = decryptPrivateJson<{ secretKey: string }>(row.rows[0].vault_secret, { tableId: agent.id, principalId: agent.principalId, kind: "agent_vault" }, this.deps.keyring);
    const keypair = Keypair.fromSecretKey(Buffer.from(secret.secretKey, "base64"));
    if (keypair.publicKey.toBase58() !== agent.vaultWallet) throw new Error("VAULT_KEY_MISMATCH");
    return keypair;
  }

  /** The vault's TEST ANSEM and SOL, read from chain. */
  async balances(agent: AgentRecord): Promise<{ ansemRaw: string | null; lamports: number | null }> {
    const { connection, stakeMint } = this.deps;
    if (!connection) return { ansemRaw: null, lamports: null };
    const owner = new PublicKey(agent.vaultWallet);
    const [lamports, tokens] = await Promise.all([
      connection.getBalance(owner).catch(() => null),
      stakeMint ? connection.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(stakeMint) }).catch(() => null) : Promise.resolve(null),
    ]);
    const ansemRaw = tokens
      ? tokens.value.reduce((sum, account) => sum + BigInt((account.account.data.parsed as { info: { tokenAmount: { amount: string } } }).info.tokenAmount.amount), 0n).toString()
      : null;
    return { ansemRaw, lamports };
  }

  /** Unfinished tables the agent is seated at, and tables it took a seat at today (UTC). */
  async usage(agent: AgentRecord): Promise<{ open: { id: string; name: string; status: string; mode: string }[]; today: number }> {
    const open = await this.deps.pool.query<{ id: string; name: string; status: string; mode: string | null }>(
      `SELECT t.id, t.name, t.status, t.rules->>'gameMode' AS mode FROM game_participants p JOIN game_tables t ON t.id = p.table_id
       WHERE p.principal_id=$1 AND t.status NOT IN ('SETTLED','CANCELLED','VOIDED') ORDER BY t.created_at DESC`, [agent.principalId],
    );
    const today = await this.deps.pool.query<{ count: string }>(
      `SELECT count(*) FROM (
         SELECT table_id FROM game_participants WHERE principal_id=$1 AND created_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc'
         UNION SELECT id FROM game_tables WHERE host_principal_id=$1 AND created_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc'
       ) seated`, [agent.principalId],
    );
    return { open: open.rows.map((row) => ({ ...row, mode: row.mode ?? "prediction" })), today: Number(today.rows[0]?.count ?? 0) };
  }
}

/**
 * Player auth plus agent calls. Agent API keys are not accepted here: only the short-lived internal
 * tokens the agent API mints for one call, so every agent action passes the agent API's limits.
 */
export class AgentAwareAuth implements GameAuthVerifier {
  constructor(private readonly inner: GameAuthVerifier, private readonly agents: AgentService) {}

  async verifyBearer(token: string): Promise<AuthPrincipal | null> {
    if (token.startsWith(INTERNAL_TOKEN_PREFIX)) {
      const agentId = this.agents.resolveInternalToken(token);
      return agentId ? { privyUserId: agentPrivyId(agentId) } : null;
    }
    if (token.startsWith(AGENT_KEY_PREFIX)) return null;
    return this.inner.verifyBearer(token);
  }

  async linkedX(privyUserId: string): Promise<LinkedXAccount | null | undefined> {
    if (isAgentPrivyId(privyUserId)) return null;
    return this.inner.linkedX?.(privyUserId);
  }
}

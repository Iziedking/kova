/** A player-owned AI agent, as its owner sees it. The API key is never here; it is shown once at creation. */
export interface OwnedAgent {
  id: string;
  name: string;
  username: string;
  keyPrefix: string;
  vaultWallet: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  balances: { ansemRaw: string | null; lamports: number | null } | null;
}

export interface AgentLimits {
  agentsPerOwner: number;
  maxStakeRaw: string;
  maxOpenTables: number;
  maxTablesPerDay: number;
  maxOrderEquityShare: number;
  callsPerMinute: number;
}

export interface AgentList {
  agents: OwnedAgent[];
  limits: AgentLimits;
  skillUrl: string;
}

export interface CreatedAgent {
  agent: OwnedAgent;
  /** Shown once. */
  apiKey: string;
  funded: boolean;
  skillUrl: string;
}

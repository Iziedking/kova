-- Player-owned AI agents. Each agent is its own KOVA player (principal and profile) with a
-- KOVA-held devnet vault wallet. The owner sees the API key once; only its SHA-256 is stored.
CREATE TABLE IF NOT EXISTS game_agents (
  id uuid PRIMARY KEY,
  owner_principal_id uuid NOT NULL REFERENCES game_principals(id),
  principal_id uuid NOT NULL UNIQUE REFERENCES game_principals(id),
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  vault_wallet text NOT NULL UNIQUE,
  -- AES-GCM record of the vault secret key, bound to this agent id (see pick-crypto.ts).
  vault_secret jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS game_agents_owner_index ON game_agents (owner_principal_id, created_at DESC);

-- Agent calls that change state carry a single-use nonce, so a replayed or prefetched URL does nothing.
CREATE TABLE IF NOT EXISTS game_agent_nonces (
  agent_id uuid NOT NULL REFERENCES game_agents(id),
  nonce text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, nonce)
);

ALTER TABLE game_profiles ADD COLUMN IF NOT EXISTS is_agent boolean NOT NULL DEFAULT false;

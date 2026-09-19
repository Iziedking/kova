-- KOVA M3 durable game state. Append-only migration; never rewrite funded history.
CREATE TABLE IF NOT EXISTS game_principals (
  id uuid PRIMARY KEY,
  privy_user_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_wallet_challenges (
  id uuid PRIMARY KEY,
  principal_id uuid NOT NULL REFERENCES game_principals(id),
  wallet text NOT NULL,
  origin text NOT NULL,
  nonce_hash text NOT NULL UNIQUE,
  message text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_wallet_challenges_principal_index
  ON game_wallet_challenges (principal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS game_wallet_bindings (
  wallet text PRIMARY KEY,
  principal_id uuid NOT NULL REFERENCES game_principals(id),
  proof_challenge_id uuid NOT NULL REFERENCES game_wallet_challenges(id),
  verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS game_wallet_bindings_principal_wallet_unique
  ON game_wallet_bindings (principal_id, wallet);

CREATE TABLE IF NOT EXISTS game_tables (
  id uuid PRIMARY KEY,
  host_principal_id uuid NOT NULL REFERENCES game_principals(id),
  name text NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('public', 'private')),
  status text NOT NULL,
  financial_status text NOT NULL,
  rules jsonb NOT NULL,
  opens_until timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_tables_public_index
  ON game_tables (visibility, status, created_at DESC);

CREATE TABLE IF NOT EXISTS game_invitations (
  id uuid PRIMARY KEY,
  table_id uuid NOT NULL REFERENCES game_tables(id),
  token_hash text NOT NULL UNIQUE,
  created_by_principal_id uuid NOT NULL REFERENCES game_principals(id),
  claimed_by_principal_id uuid REFERENCES game_principals(id),
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_participants (
  id uuid PRIMARY KEY,
  table_id uuid NOT NULL REFERENCES game_tables(id),
  principal_id uuid NOT NULL REFERENCES game_principals(id),
  wallet text NOT NULL,
  commitment text NOT NULL,
  sealed_market_hash text NOT NULL,
  admission_decision text NOT NULL,
  funding_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_participants_table_wallet_unique UNIQUE (table_id, wallet),
  CONSTRAINT game_participants_table_principal_unique UNIQUE (table_id, principal_id)
);

CREATE TABLE IF NOT EXISTS game_private_records (
  id uuid PRIMARY KEY,
  table_id uuid NOT NULL REFERENCES game_tables(id),
  principal_id uuid NOT NULL REFERENCES game_principals(id),
  kind text NOT NULL,
  key_id text NOT NULL,
  iv_base64 text NOT NULL,
  auth_tag_base64 text NOT NULL,
  ciphertext_base64 text NOT NULL,
  aad_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_private_records_owner_kind_unique UNIQUE (table_id, principal_id, kind)
);

CREATE TABLE IF NOT EXISTS game_idempotency (
  principal_id uuid NOT NULL REFERENCES game_principals(id),
  operation_key text NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (principal_id, operation_key)
);

CREATE TABLE IF NOT EXISTS game_budget_reservations (
  id uuid PRIMARY KEY,
  principal_id uuid REFERENCES game_principals(id),
  category text NOT NULL,
  operation_key text NOT NULL UNIQUE,
  amount_micro_usd bigint NOT NULL CHECK (amount_micro_usd >= 0),
  status text NOT NULL CHECK (status IN ('reserved', 'spent', 'released')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);


-- KOVA M4 private Dealer cache and provider receipts.
CREATE TABLE IF NOT EXISTS game_dealer_cache (
  cache_key text PRIMARY KEY,
  network text NOT NULL,
  mint_hash text NOT NULL,
  schema_version text NOT NULL,
  decision text NOT NULL,
  key_id text NOT NULL,
  iv_base64 text NOT NULL,
  auth_tag_base64 text NOT NULL,
  ciphertext_base64 text NOT NULL,
  aad_hash text NOT NULL,
  evidence_hash text NOT NULL,
  public_projection jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_dealer_cache_identity_unique UNIQUE (network, mint_hash, schema_version, evidence_hash)
);
CREATE INDEX IF NOT EXISTS game_dealer_cache_lookup_index
  ON game_dealer_cache (network, mint_hash, schema_version, expires_at DESC);

CREATE TABLE IF NOT EXISTS game_dealer_receipts (
  id uuid PRIMARY KEY,
  operation_key text NOT NULL UNIQUE,
  cache_key text REFERENCES game_dealer_cache(cache_key),
  provider_request_id text,
  model text,
  cost_micro_usd bigint NOT NULL CHECK (cost_micro_usd >= 0),
  tools_used jsonb NOT NULL,
  isolation_status text NOT NULL,
  result text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);


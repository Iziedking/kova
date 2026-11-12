-- NEAR mode (CHIP). The contract is the record of tables, stakes, burns and payouts; these two
-- tables hold only what the chain cannot: each pick sealed until the settler reveals it, and the
-- evidence behind every price the settler reported.
CREATE TABLE IF NOT EXISTS near_picks (
  contract_id text NOT NULL,
  table_id bigint NOT NULL,
  player text NOT NULL,
  commitment text NOT NULL CHECK (commitment ~ '^[0-9a-f]{64}$'),
  -- AES-256-GCM envelope of {market, salt}; same keyring as Solana picks.
  sealed jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contract_id, table_id, player)
);

CREATE TABLE IF NOT EXISTS near_price_marks (
  contract_id text NOT NULL,
  table_id bigint NOT NULL,
  player text NOT NULL,
  phase text NOT NULL CHECK (phase IN ('start', 'end')),
  market text NOT NULL,
  price_e18 numeric(40, 0) NOT NULL CHECK (price_e18 >= 0),
  source text NOT NULL,
  source_ref text NOT NULL,
  captured_at timestamptz NOT NULL,
  tx_hash text,
  PRIMARY KEY (contract_id, table_id, player, phase)
);
CREATE INDEX IF NOT EXISTS near_price_marks_table_index ON near_price_marks (contract_id, table_id);

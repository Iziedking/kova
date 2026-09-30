-- Every Dealer decision, for the public Dealer desk and as a restart-proof decision cache.
-- An admitted pick is published only once its table can no longer be played (see dealer-desk.ts),
-- so the log never reveals a live secret pick.
CREATE TABLE IF NOT EXISTS game_dealer_decisions (
  id uuid PRIMARY KEY,
  mint text NOT NULL,
  symbol text,
  name text,
  decision text NOT NULL CHECK (decision IN ('ACCEPTED','REJECTED','INSUFFICIENT_EVIDENCE')),
  confidence double precision,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_hash text,
  source text NOT NULL CHECK (source IN ('check','admission')),
  -- True when the verdict was reused from an earlier agent run instead of a fresh one.
  reused boolean NOT NULL DEFAULT false,
  table_id uuid REFERENCES game_tables(id),
  principal_id uuid REFERENCES game_principals(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_dealer_decisions_mint_index ON game_dealer_decisions (mint, created_at DESC);
CREATE INDEX IF NOT EXISTS game_dealer_decisions_time_index ON game_dealer_decisions (created_at DESC);

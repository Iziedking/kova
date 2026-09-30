-- The KOVA House trader's decision log. Each row is one decision in one live Trade match:
-- what the brain (a ClawPump agent) or the fallback rules proposed, what KOVA's risk rules
-- changed, and what was filled. Published only after the match is over (see house-trader.ts).
CREATE TABLE IF NOT EXISTS game_house_decisions (
  id uuid PRIMARY KEY,
  table_id uuid NOT NULL REFERENCES game_tables(id),
  source text NOT NULL CHECK (source IN ('agent', 'rules', 'risk')),
  view text,
  proposed jsonb NOT NULL DEFAULT '[]'::jsonb,
  executed jsonb NOT NULL DEFAULT '[]'::jsonb,
  refused jsonb NOT NULL DEFAULT '[]'::jsonb,
  equity_usd double precision,
  pnl_pct double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_house_decisions_table_index ON game_house_decisions (table_id, created_at);
CREATE INDEX IF NOT EXISTS game_house_decisions_time_index ON game_house_decisions (created_at DESC);

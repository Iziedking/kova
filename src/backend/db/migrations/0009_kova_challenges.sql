-- Direct challenges: a private table created for two named players. The opponent gets a
-- pre-claimed invitation, so the table opens for them from a notification without a link.
CREATE TABLE IF NOT EXISTS game_challenges (
  id uuid PRIMARY KEY,
  table_id uuid NOT NULL REFERENCES game_tables(id),
  from_principal_id uuid NOT NULL REFERENCES game_principals(id),
  to_principal_id uuid NOT NULL REFERENCES game_principals(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_challenges_not_self CHECK (from_principal_id <> to_principal_id)
);
CREATE INDEX IF NOT EXISTS game_challenges_to_index ON game_challenges (to_principal_id, created_at DESC);

-- Notifications are derived from game state; this only records when a player last opened them.
CREATE TABLE IF NOT EXISTS game_notification_reads (
  principal_id uuid PRIMARY KEY REFERENCES game_principals(id),
  seen_at timestamptz NOT NULL
);

-- Season points and referrals. Points are an off-chain record with no cash value; a future season
-- may convert them to rewards. Every award is tied to a settled, staked game, so the ledger can be
-- recomputed from game history, and the unique key makes each award claimable once.
CREATE TABLE IF NOT EXISTS game_referrals (
  referee_principal_id uuid PRIMARY KEY REFERENCES game_principals(id),
  referrer_principal_id uuid NOT NULL REFERENCES game_principals(id),
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  qualified_at timestamptz,
  CONSTRAINT game_referrals_not_self CHECK (referee_principal_id <> referrer_principal_id)
);
CREATE INDEX IF NOT EXISTS game_referrals_referrer_index ON game_referrals (referrer_principal_id);

CREATE TABLE IF NOT EXISTS game_points (
  id uuid PRIMARY KEY,
  principal_id uuid NOT NULL REFERENCES game_principals(id),
  kind text NOT NULL CHECK (kind IN ('play', 'win', 'referral', 'welcome')),
  amount integer NOT NULL CHECK (amount > 0),
  -- The table id for play and win; the referee's principal id for referral and welcome.
  ref text NOT NULL,
  season integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (principal_id, kind, ref)
);
CREATE INDEX IF NOT EXISTS game_points_principal_index ON game_points (principal_id, created_at DESC);

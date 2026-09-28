-- Public player identity. The X fields are copied only from Privy's server API for the
-- account's own linked X login, never from what a browser sends.
CREATE TABLE IF NOT EXISTS game_profiles (
  principal_id uuid PRIMARY KEY REFERENCES game_principals(id),
  username text NOT NULL,
  display_name text,
  avatar_seed text NOT NULL,
  x_username text,
  x_name text,
  x_avatar_url text,
  x_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_profiles_username_format CHECK (username ~ '^[a-z0-9_]{3,20}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS game_profiles_username_unique ON game_profiles (username);

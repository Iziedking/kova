-- NEAR mode: email accounts Kova funded. A Privy email wallet is a NEAR implicit account, which
-- exists on chain only once it receives NEAR. Kova sends each one a little testnet NEAR, once per
-- Privy login. The row is written before the transfer (funded_at stays null until it lands), so a
-- retry or a restart never pays twice.
CREATE TABLE IF NOT EXISTS near_email_accounts (
  privy_user_id text PRIMARY KEY,
  account_id text NOT NULL UNIQUE CHECK (account_id ~ '^[0-9a-f]{64}$'),
  amount_yocto numeric(40, 0) NOT NULL CHECK (amount_yocto >= 0),
  tx_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  funded_at timestamptz
);
CREATE INDEX IF NOT EXISTS near_email_accounts_created_index ON near_email_accounts (created_at);

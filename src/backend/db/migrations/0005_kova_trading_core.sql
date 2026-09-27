-- KOVA Trading Mode local ledger. This stores observed/accounting state only;
-- it does not custody funds, authorize swaps, or settle ANSEM.
CREATE TABLE IF NOT EXISTS game_trading_accounts (
  id uuid PRIMARY KEY,
  table_id uuid NOT NULL REFERENCES game_tables(id),
  principal_id uuid NOT NULL REFERENCES game_principals(id),
  wallet text NOT NULL,
  custody text NOT NULL CHECK (custody IN ('user_authorized','unsupported')),
  status text NOT NULL CHECK (status IN ('pending','active','frozen','settled','rejected')),
  starting_cash_micro_usd numeric(39,0) NOT NULL CHECK (starting_cash_micro_usd > 0),
  cash_micro_usd numeric(39,0) NOT NULL CHECK (cash_micro_usd >= 0),
  realized_pnl_micro_usd numeric(39,0) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (table_id, principal_id),
  UNIQUE (table_id, wallet)
);

CREATE TABLE IF NOT EXISTS game_trading_positions (
  account_id uuid NOT NULL REFERENCES game_trading_accounts(id),
  asset_mint text NOT NULL,
  asset_decimals integer NOT NULL CHECK (asset_decimals BETWEEN 0 AND 18),
  quantity_raw numeric(39,0) NOT NULL CHECK (quantity_raw > 0),
  cost_basis_micro_usd numeric(39,0) NOT NULL CHECK (cost_basis_micro_usd >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, asset_mint)
);

CREATE TABLE IF NOT EXISTS game_trading_fills (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES game_trading_accounts(id),
  tx_signature text NOT NULL UNIQUE,
  side text NOT NULL CHECK (side IN ('buy','sell')),
  asset_mint text NOT NULL,
  asset_decimals integer NOT NULL CHECK (asset_decimals BETWEEN 0 AND 18),
  quantity_raw numeric(39,0) NOT NULL CHECK (quantity_raw > 0),
  quote_amount_micro_usd numeric(39,0) NOT NULL CHECK (quote_amount_micro_usd >= 0),
  fee_micro_usd numeric(39,0) NOT NULL CHECK (fee_micro_usd >= 0),
  observed_at timestamptz NOT NULL,
  observed_slot bigint,
  source text NOT NULL CHECK (source IN ('helius','solana_rpc','owner_verified')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_trading_fills_account_time_index ON game_trading_fills (account_id, observed_at);

CREATE TABLE IF NOT EXISTS game_trading_marks (
  account_id uuid NOT NULL REFERENCES game_trading_accounts(id),
  asset_mint text NOT NULL,
  asset_decimals integer NOT NULL CHECK (asset_decimals BETWEEN 0 AND 18),
  price_micro_usd numeric(39,0) NOT NULL CHECK (price_micro_usd >= 0),
  observed_at timestamptz NOT NULL,
  source text NOT NULL CHECK (source IN ('helius','clawpump','solana_rpc','fixture')),
  PRIMARY KEY (account_id, asset_mint, observed_at)
);

CREATE TABLE IF NOT EXISTS game_trading_reconciliations (
  tx_signature text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES game_trading_accounts(id),
  wallet text NOT NULL,
  status text NOT NULL CHECK (status IN ('confirmed','failed','unknown')),
  slot bigint,
  observed_at timestamptz NOT NULL,
  source text NOT NULL CHECK (source IN ('helius','solana_rpc')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

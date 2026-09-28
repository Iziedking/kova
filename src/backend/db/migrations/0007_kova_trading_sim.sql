-- Trade mode on devnet: fills at the live DEX price against a virtual balance.
-- The ANSEM stake and payout stay in the on-chain escrow; no swap is sent.
ALTER TABLE game_trading_fills DROP CONSTRAINT IF EXISTS game_trading_fills_source_check;
ALTER TABLE game_trading_fills ADD CONSTRAINT game_trading_fills_source_check
  CHECK (source IN ('helius','solana_rpc','owner_verified','simulated'));
ALTER TABLE game_trading_fills ADD COLUMN IF NOT EXISTS price18 numeric(39,0);
ALTER TABLE game_trading_fills ADD COLUMN IF NOT EXISTS symbol text;
ALTER TABLE game_trading_positions ADD COLUMN IF NOT EXISTS symbol text;

CREATE TABLE IF NOT EXISTS game_trading_quotes (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES game_trading_accounts(id),
  side text NOT NULL CHECK (side IN ('buy','sell')),
  asset_mint text NOT NULL,
  symbol text NOT NULL,
  input_micro_usd numeric(39,0) NOT NULL CHECK (input_micro_usd > 0),
  price18 numeric(39,0) NOT NULL CHECK (price18 > 0),
  expires_at timestamptz NOT NULL,
  fill_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_trading_quotes_account_index ON game_trading_quotes (account_id, created_at);

-- KOVA on-chain game loop. Append-only: adds chain state beside the M3 records.
ALTER TABLE game_tables ADD COLUMN IF NOT EXISTS chain_network text;
ALTER TABLE game_tables ADD COLUMN IF NOT EXISTS chain_address text;
ALTER TABLE game_tables ADD COLUMN IF NOT EXISTS chain_status text NOT NULL DEFAULT 'none'
  CHECK (chain_status IN ('none','open','locking','active','settling','settled','cancelled','voided'));
CREATE UNIQUE INDEX IF NOT EXISTS game_tables_chain_address_unique
  ON game_tables (chain_address) WHERE chain_address IS NOT NULL;

ALTER TABLE game_participants ADD COLUMN IF NOT EXISTS admission_evidence_hash text;
ALTER TABLE game_participants ADD COLUMN IF NOT EXISTS admission_public jsonb;
ALTER TABLE game_participants ADD COLUMN IF NOT EXISTS admission_decided_at timestamptz;
ALTER TABLE game_participants ADD COLUMN IF NOT EXISTS funding_signature text;
ALTER TABLE game_participants ADD COLUMN IF NOT EXISTS funded_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS game_participants_funding_signature_unique
  ON game_participants (funding_signature) WHERE funding_signature IS NOT NULL;

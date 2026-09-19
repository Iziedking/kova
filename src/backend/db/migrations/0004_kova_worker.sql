-- KOVA M5 leased orchestration, immutable captures, events and chain intent.
CREATE TABLE IF NOT EXISTS game_jobs (
  id uuid PRIMARY KEY,
  operation_key text NOT NULL UNIQUE,
  table_id uuid NOT NULL REFERENCES game_tables(id),
  kind text NOT NULL,
  state text NOT NULL CHECK (state IN ('queued','running','completed','failed','cancelled')),
  run_at timestamptz NOT NULL,
  lease_owner text,
  lease_epoch bigint NOT NULL DEFAULT 0,
  lease_expires_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  payload jsonb NOT NULL,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_jobs_due_index ON game_jobs (state, run_at, lease_expires_at);

CREATE TABLE IF NOT EXISTS game_capture_plans (
  table_id uuid PRIMARY KEY REFERENCES game_tables(id),
  policy_hash text NOT NULL,
  mode text NOT NULL,
  provider text NOT NULL,
  provider_version text NOT NULL,
  start_target_at timestamptz NOT NULL,
  end_target_at timestamptz NOT NULL,
  max_start_delay_ms integer NOT NULL,
  response_deadline_ms integer NOT NULL,
  max_cross_pair_skew_ms integer NOT NULL,
  fallback_delay_ms integer,
  pair_bindings jsonb NOT NULL,
  frozen_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_price_samples (
  id uuid PRIMARY KEY,
  table_id uuid NOT NULL REFERENCES game_tables(id),
  phase text NOT NULL CHECK (phase IN ('start','end')),
  pair_address text NOT NULL,
  target_at timestamptz NOT NULL,
  request_started_at timestamptz NOT NULL,
  request_finished_at timestamptz NOT NULL,
  provider_observed_at timestamptz,
  provider_slot bigint,
  captured_at timestamptz NOT NULL,
  price18 numeric(39,0) NOT NULL,
  liquidity_usd_micro numeric(39,0),
  raw_response_hash text NOT NULL,
  source text NOT NULL,
  attempt integer NOT NULL,
  policy_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_price_samples_once UNIQUE (table_id, phase, pair_address)
);

CREATE TABLE IF NOT EXISTS game_result_manifests (
  table_id uuid PRIMARY KEY REFERENCES game_tables(id),
  operation_key text NOT NULL UNIQUE,
  manifest_hash text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('frozen','submitted','confirmed','voided')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_chain_operations (
  operation_key text PRIMARY KEY,
  table_id uuid NOT NULL REFERENCES game_tables(id),
  kind text NOT NULL,
  message_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('prepared','submitted','confirmed','failed','unknown')),
  signature text,
  last_valid_block_height bigint,
  attempt integer NOT NULL DEFAULT 0,
  submitted_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_events (
  sequence bigserial PRIMARY KEY,
  table_id uuid NOT NULL REFERENCES game_tables(id),
  audience text NOT NULL CHECK (audience IN ('public','principal','operator')),
  principal_id uuid REFERENCES game_principals(id),
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_events_replay_index ON game_events (table_id, sequence);


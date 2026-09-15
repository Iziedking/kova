-- FLOAT Group 2 durable evidence schema. Apply with a PostgreSQL migration runner.
CREATE TABLE IF NOT EXISTS market_candidates (
  id text PRIMARY KEY,
  cluster text NOT NULL,
  pool text NOT NULL,
  program_id text NOT NULL,
  stock_mint text NOT NULL,
  status text NOT NULL,
  snapshot_hash text NOT NULL,
  payload jsonb NOT NULL,
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_candidates_snapshot_unique UNIQUE (id, snapshot_hash)
);

CREATE TABLE IF NOT EXISTS evidence_snapshots (
  id text PRIMARY KEY,
  kind text NOT NULL,
  subject_id text NOT NULL,
  report_hash text NOT NULL,
  source text NOT NULL,
  slot integer,
  observed_at timestamptz NOT NULL,
  expires_at timestamptz,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evidence_snapshots_identity_unique UNIQUE (kind, subject_id, report_hash)
);
CREATE INDEX IF NOT EXISTS evidence_snapshots_latest_index ON evidence_snapshots (kind, subject_id, observed_at);

CREATE TABLE IF NOT EXISTS feasibility_reports (
  id text PRIMARY KEY,
  market_id text NOT NULL,
  report_hash text NOT NULL,
  status text NOT NULL,
  payload jsonb NOT NULL,
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feasibility_reports_identity_unique UNIQUE (market_id, report_hash)
);

CREATE TABLE IF NOT EXISTS stock_checks (
  id text PRIMARY KEY,
  market_id text NOT NULL,
  report_hash text NOT NULL,
  status text NOT NULL,
  payload jsonb NOT NULL,
  observed_at timestamptz NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_checks_identity_unique UNIQUE (market_id, report_hash)
);

CREATE TABLE IF NOT EXISTS campaign_previews (
  id text PRIMARY KEY,
  campaign_id text NOT NULL,
  version integer NOT NULL,
  snapshot_hash text NOT NULL,
  payload jsonb NOT NULL,
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_previews_identity_unique UNIQUE (campaign_id, version, snapshot_hash)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id text PRIMARY KEY,
  correlation_id text NOT NULL,
  operation_key text,
  event_type text NOT NULL,
  subject_id text NOT NULL,
  source text NOT NULL,
  slot integer,
  latency_ms integer,
  result text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_correlation_index ON audit_events (correlation_id);

CREATE TABLE IF NOT EXISTS operation_identities (
  operation_key text PRIMARY KEY,
  kind text NOT NULL,
  status text NOT NULL,
  result_hash text,
  last_seen_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

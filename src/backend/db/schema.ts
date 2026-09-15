/** Drizzle schema for durable FLOAT evidence and operation state. PostgreSQL schema reviewed 2026-09-15. */
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

export const marketCandidates = pgTable("market_candidates", {
  id: text("id").primaryKey(),
  cluster: text("cluster").notNull(),
  pool: text("pool").notNull(),
  programId: text("program_id").notNull(),
  stockMint: text("stock_mint").notNull(),
  status: text("status").notNull(),
  snapshotHash: text("snapshot_hash").notNull(),
  payload: jsonb("payload").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("market_candidates_snapshot_unique").on(table.id, table.snapshotHash),
]);

export const evidenceSnapshots = pgTable("evidence_snapshots", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  subjectId: text("subject_id").notNull(),
  reportHash: text("report_hash").notNull(),
  source: text("source").notNull(),
  slot: integer("slot"),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  payload: jsonb("payload").notNull(),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("evidence_snapshots_identity_unique").on(table.kind, table.subjectId, table.reportHash),
  index("evidence_snapshots_latest_index").on(table.kind, table.subjectId, table.observedAt),
]);

export const feasibilityReports = pgTable("feasibility_reports", {
  id: text("id").primaryKey(),
  marketId: text("market_id").notNull(),
  reportHash: text("report_hash").notNull(),
  status: text("status").notNull(),
  payload: jsonb("payload").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("feasibility_reports_identity_unique").on(table.marketId, table.reportHash)]);

export const stockChecks = pgTable("stock_checks", {
  id: text("id").primaryKey(),
  marketId: text("market_id").notNull(),
  reportHash: text("report_hash").notNull(),
  status: text("status").notNull(),
  payload: jsonb("payload").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("stock_checks_identity_unique").on(table.marketId, table.reportHash)]);

export const campaignPreviews = pgTable("campaign_previews", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull(),
  version: integer("version").notNull(),
  snapshotHash: text("snapshot_hash").notNull(),
  payload: jsonb("payload").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("campaign_previews_identity_unique").on(table.campaignId, table.version, table.snapshotHash)]);

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  correlationId: text("correlation_id").notNull(),
  operationKey: text("operation_key"),
  eventType: text("event_type").notNull(),
  subjectId: text("subject_id").notNull(),
  source: text("source").notNull(),
  slot: integer("slot"),
  latencyMs: integer("latency_ms"),
  result: text("result").notNull(),
  payload: jsonb("payload"),
  createdAt: createdAt(),
}, (table) => [index("audit_events_correlation_index").on(table.correlationId)]);

export const operationIdentities = pgTable("operation_identities", {
  operationKey: text("operation_key").primaryKey(),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  resultHash: text("result_hash"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

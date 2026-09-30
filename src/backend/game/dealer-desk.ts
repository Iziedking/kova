/**
 * The Dealer desk: KOVA's ClawPump Dealer agent, shown as the working desk it is. Totals are
 * public at once. Single verdicts are published only when they can't give away a live sealed pick:
 * a refusal is public straight away (nobody can play a refused pick), while an admitted pick waits
 * until its table is over, or, for a pre-check that never reached a table, until any table it
 * could have fed has expired.
 */
import type { Pool } from "pg";

/** A draft lobby lives 24h, then 10 minutes to fill and at most 15 to play; 26h clears all of it. */
const PRECHECK_EMBARGO_HOURS = 26;
const FINISHED_STATUSES = ["SETTLED", "CANCELLED", "VOIDED"];

export type DealerVerdict = "ACCEPTED" | "REJECTED" | "INSUFFICIENT_EVIDENCE";

export interface DealerDeskEntry {
  id: string;
  mint: string;
  symbol: string | null;
  name: string | null;
  decision: DealerVerdict;
  confidence: number | null;
  reasons: string[];
  evidenceHash: string | null;
  source: "check" | "admission";
  tableId: string | null;
  at: string;
}

export interface DealerDeskStats {
  /** Fresh agent runs (a reused verdict is not counted twice). */
  runs: number;
  /** Every decision served, fresh or reused. */
  decisions: number;
  accepted: number;
  refused: number;
  admitRate: number | null;
  avgConfidence: number | null;
  last24hRuns: number;
  distinctTokens: number;
}

export interface DealerDesk { stats: DealerDeskStats; verdicts: DealerDeskEntry[] }

interface Row {
  id: string; mint: string; symbol: string | null; name: string | null; decision: DealerVerdict; confidence: number | null;
  reasons: unknown; evidence_hash: string | null; source: "check" | "admission"; table_id: string | null; created_at: Date;
}

const asReasons = (value: unknown): string[] => Array.isArray(value) ? value.filter((reason): reason is string => typeof reason === "string").slice(0, 4) : [];

export class DealerDeskService {
  constructor(private readonly deps: { pool: Pool }) {}

  async desk(limit = 30): Promise<DealerDesk> {
    const [stats, verdicts] = await Promise.all([this.stats(), this.publishable(Math.min(Math.max(limit, 1), 100))]);
    return { stats, verdicts };
  }

  async stats(): Promise<DealerDeskStats> {
    const result = await this.deps.pool.query<{
      runs: string; decisions: string; accepted: string; refused: string; avg_confidence: number | null; last_24h: string; tokens: string;
    }>(
      `SELECT count(*) FILTER (WHERE NOT reused) AS runs,
              count(*) AS decisions,
              count(*) FILTER (WHERE NOT reused AND decision='ACCEPTED') AS accepted,
              count(*) FILTER (WHERE NOT reused AND decision<>'ACCEPTED') AS refused,
              avg(confidence) FILTER (WHERE NOT reused AND confidence IS NOT NULL) AS avg_confidence,
              count(*) FILTER (WHERE NOT reused AND created_at > now() - interval '24 hours') AS last_24h,
              count(DISTINCT mint) AS tokens
       FROM game_dealer_decisions`,
    );
    const row = result.rows[0];
    const runs = Number(row?.runs ?? 0);
    const accepted = Number(row?.accepted ?? 0);
    return {
      runs,
      decisions: Number(row?.decisions ?? 0),
      accepted,
      refused: Number(row?.refused ?? 0),
      admitRate: runs > 0 ? accepted / runs : null,
      avgConfidence: row?.avg_confidence === null || row?.avg_confidence === undefined ? null : Number(row.avg_confidence),
      last24hRuns: Number(row?.last_24h ?? 0),
      distinctTokens: Number(row?.tokens ?? 0),
    };
  }

  /** Fresh verdicts that can be shown without revealing a pick still in play, newest first. */
  async publishable(limit: number): Promise<DealerDeskEntry[]> {
    const result = await this.deps.pool.query<Row>(
      `SELECT d.id, d.mint, d.symbol, d.name, d.decision, d.confidence, d.reasons, d.evidence_hash, d.source, d.table_id, d.created_at
       FROM game_dealer_decisions d
       LEFT JOIN game_tables t ON t.id = d.table_id
       WHERE NOT d.reused AND (
         d.decision <> 'ACCEPTED'
         OR (d.table_id IS NOT NULL AND t.status = ANY($1))
         OR (d.table_id IS NULL AND d.created_at < now() - make_interval(hours => $2))
       )
       ORDER BY d.created_at DESC LIMIT $3`,
      [FINISHED_STATUSES, PRECHECK_EMBARGO_HOURS, limit],
    );
    return result.rows.map((row) => ({
      id: row.id, mint: row.mint, symbol: row.symbol, name: row.name, decision: row.decision,
      confidence: row.confidence === null ? null : Number(row.confidence), reasons: asReasons(row.reasons),
      evidenceHash: row.evidence_hash, source: row.source, tableId: row.table_id, at: row.created_at.toISOString(),
    }));
  }

  /**
   * Plain text for the Dealer agent's scheduled X posts: the running totals plus the newest
   * publishable verdicts, one line each. Nothing here names a player.
   */
  async feed(limit = 5): Promise<string> {
    const { stats, verdicts } = await this.desk(limit);
    const lines = [
      `KOVA Dealer desk. ${stats.runs} token checks so far, ${stats.accepted} admitted, ${stats.refused} refused` +
        (stats.admitRate === null ? "." : ` (${Math.round(stats.admitRate * 100)}% admit rate).`) +
        ` ${stats.last24hRuns} in the last 24 hours.`,
    ];
    for (const verdict of verdicts) {
      const label = verdict.symbol ? `$${verdict.symbol}` : `${verdict.mint.slice(0, 4)}…${verdict.mint.slice(-4)}`;
      const word = verdict.decision === "ACCEPTED" ? "admitted" : verdict.decision === "REJECTED" ? "refused" : "refused (not enough evidence)";
      const confidence = verdict.confidence === null ? "" : ` at ${Math.round(verdict.confidence * 100)}% confidence`;
      const reason = verdict.reasons[0] ? `: ${verdict.reasons[0]}` : "";
      lines.push(`${label} ${word}${confidence}${reason} [${verdict.at.slice(0, 16).replace("T", " ")} UTC]`);
    }
    lines.push("Every verdict: https://kova.surf/dealer");
    return lines.join("\n");
  }
}

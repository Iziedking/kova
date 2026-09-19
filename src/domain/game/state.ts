export type TableStatus = "DRAFT" | "OPEN" | "LOCKING" | "ACTIVE" | "SETTLING" | "SETTLED" | "CANCELLED" | "VOIDED";
export type FinancialStatus = "unfunded" | "funding_pending" | "funded" | "result_final" | "payouts_pending" | "paid" | "refunds_pending" | "refunded" | "unknown";
export type ClockInput = { nowMs: number; source: "test" | "server" | "chain" };
export type GameMode = "preview" | "devnet" | "limited_live";

export const TABLE_LIMITS = {
  maximumOpenMs: 10 * 60 * 1_000,
  activationWindowMs: 2 * 60 * 1_000,
  roundDurationMs: 15 * 60 * 1_000,
  settlementWindowMs: 5 * 60 * 1_000,
} as const;

export interface TableRuntime {
  status: TableStatus;
  financialStatus: FinancialStatus;
  openDeadlineMs: number | null;
  activationDeadlineMs: number | null;
  startsAtMs: number | null;
  endsAtMs: number | null;
  settlementDeadlineMs: number | null;
  fundedPlayerCount: number;
}

export type TableCommand =
  | { type: "OPEN"; openForMs: number }
  | { type: "LOCK" }
  | { type: "ACTIVATE"; roster: readonly { wallet: string; funded: boolean; admitted: boolean }[] }
  | { type: "BEGIN_SETTLEMENT" }
  | { type: "FINALIZE" }
  | { type: "MARK_PAID" }
  | { type: "MARK_REFUNDED" }
  | { type: "TIMEOUT" }
  | { type: "CANCEL" };

export type TransitionResult =
  | { ok: true; state: TableRuntime; event: string }
  | { ok: false; state: TableRuntime; code: string; message: string };

export function draftTable(): TableRuntime {
  return { status: "DRAFT", financialStatus: "unfunded", openDeadlineMs: null, activationDeadlineMs: null, startsAtMs: null, endsAtMs: null, settlementDeadlineMs: null, fundedPlayerCount: 0 };
}

function accepted(state: TableRuntime, patch: Partial<TableRuntime>, event: string): TransitionResult {
  return { ok: true, state: { ...state, ...patch }, event };
}

function refused(state: TableRuntime, code: string, message: string): TransitionResult {
  return { ok: false, state, code, message };
}

export function reduceTable(state: TableRuntime, command: TableCommand, clock: ClockInput): TransitionResult {
  if (!Number.isSafeInteger(clock.nowMs) || clock.nowMs < 0) return refused(state, "INVALID_CLOCK", "Clock must be a non-negative integer timestamp.");

  switch (command.type) {
    case "OPEN":
      if (state.status !== "DRAFT") return refused(state, "INVALID_STATE", "Only a draft table can open.");
      if (!Number.isSafeInteger(command.openForMs) || command.openForMs <= 0 || command.openForMs > TABLE_LIMITS.maximumOpenMs) return refused(state, "INVALID_OPEN_WINDOW", "Open window must be between 1ms and 10 minutes.");
      return accepted(state, { status: "OPEN", openDeadlineMs: clock.nowMs + command.openForMs }, "table_opened");
    case "LOCK":
      if (state.status !== "OPEN") return refused(state, "INVALID_STATE", "Only an open table can lock.");
      if (state.openDeadlineMs === null || clock.nowMs > state.openDeadlineMs) return refused(state, "OPEN_WINDOW_EXPIRED", "The table open window has expired.");
      return accepted(state, { status: "LOCKING", financialStatus: "funding_pending", activationDeadlineMs: clock.nowMs + TABLE_LIMITS.activationWindowMs }, "table_locking");
    case "ACTIVATE": {
      if (state.status !== "LOCKING") return refused(state, "INVALID_STATE", "Only a locking table can activate.");
      if (state.activationDeadlineMs === null || clock.nowMs > state.activationDeadlineMs) return refused(state, "ACTIVATION_WINDOW_EXPIRED", "The activation window has expired.");
      const funded = command.roster.filter((player) => player.funded);
      const invalidFunded = funded.filter((player) => !player.admitted);
      if (invalidFunded.length > 0) return accepted(state, { status: "CANCELLED", financialStatus: "refunds_pending", fundedPlayerCount: funded.length }, "invalid_funded_admission_cancelled");
      if (funded.length < 2) return accepted(state, { status: "CANCELLED", financialStatus: funded.length === 0 ? "unfunded" : "refunds_pending", fundedPlayerCount: funded.length }, "insufficient_funded_players_cancelled");
      const endsAtMs = clock.nowMs + TABLE_LIMITS.roundDurationMs;
      return accepted(state, { status: "ACTIVE", financialStatus: "funded", fundedPlayerCount: funded.length, startsAtMs: clock.nowMs, endsAtMs, settlementDeadlineMs: endsAtMs + TABLE_LIMITS.settlementWindowMs }, "table_activated");
    }
    case "BEGIN_SETTLEMENT":
      if (state.status !== "ACTIVE") return refused(state, "INVALID_STATE", "Only an active table can begin settlement.");
      if (state.endsAtMs === null || clock.nowMs < state.endsAtMs) return refused(state, "ROUND_STILL_ACTIVE", "Settlement cannot begin before the round ends.");
      return accepted(state, { status: "SETTLING" }, "settlement_started");
    case "FINALIZE":
      if (state.status !== "SETTLING") return refused(state, "INVALID_STATE", "Only a settling table can finalize.");
      if (state.settlementDeadlineMs === null || clock.nowMs >= state.settlementDeadlineMs) return refused(state, "SETTLEMENT_DEADLINE_REACHED", "Finalization is disallowed at or after the settlement deadline.");
      return accepted(state, { status: "SETTLED", financialStatus: "payouts_pending" }, "result_finalized");
    case "MARK_PAID":
      if (state.status !== "SETTLED" || state.financialStatus !== "payouts_pending") return refused(state, "INVALID_STATE", "Only a finalized payout can be marked paid.");
      return accepted(state, { financialStatus: "paid" }, "payouts_paid");
    case "MARK_REFUNDED":
      if ((state.status !== "CANCELLED" && state.status !== "VOIDED") || state.financialStatus !== "refunds_pending") return refused(state, "INVALID_STATE", "Only a pending refund can be marked refunded.");
      return accepted(state, { financialStatus: "refunded" }, "refunds_paid");
    case "TIMEOUT":
      if (state.status === "OPEN" && state.openDeadlineMs !== null && clock.nowMs >= state.openDeadlineMs) return accepted(state, { status: "CANCELLED", financialStatus: "unfunded" }, "open_window_timed_out");
      if (state.status === "LOCKING" && state.activationDeadlineMs !== null && clock.nowMs >= state.activationDeadlineMs) return accepted(state, { status: "CANCELLED", financialStatus: state.fundedPlayerCount > 0 ? "refunds_pending" : "unknown" }, "activation_timed_out");
      if (state.status === "SETTLING" && state.settlementDeadlineMs !== null && clock.nowMs >= state.settlementDeadlineMs) return accepted(state, { status: "VOIDED", financialStatus: "refunds_pending" }, "settlement_timed_out");
      return refused(state, "TIMEOUT_NOT_DUE", "No timeout is due for this table.");
    case "CANCEL":
      if (state.status !== "DRAFT" && state.status !== "OPEN") return refused(state, "CANCELLATION_NOT_ALLOWED", "This table can no longer be cancelled directly.");
      return accepted(state, { status: "CANCELLED", financialStatus: "unfunded" }, "table_cancelled");
  }
}

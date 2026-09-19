import assert from "node:assert/strict";
import test from "node:test";
import { draftTable, reduceTable, TABLE_LIMITS, type TableRuntime } from "../../src/domain/game/state";

const at = (nowMs: number) => ({ nowMs, source: "test" as const });

function expectState(result: ReturnType<typeof reduceTable>): TableRuntime {
  assert.equal(result.ok, true);
  return result.state;
}

test("happy path preserves explicit game and financial states", () => {
  let state = draftTable();
  state = expectState(reduceTable(state, { type: "OPEN", openForMs: 60_000 }, at(1_000)));
  state = expectState(reduceTable(state, { type: "LOCK" }, at(2_000)));
  state = expectState(reduceTable(state, { type: "ACTIVATE", roster: [
    { wallet: "a", funded: true, admitted: true },
    { wallet: "b", funded: true, admitted: true },
  ] }, at(3_000)));
  assert.equal(state.status, "ACTIVE");
  assert.equal(state.financialStatus, "funded");
  assert.equal(state.endsAtMs, 3_000 + TABLE_LIMITS.roundDurationMs);
  state = expectState(reduceTable(state, { type: "BEGIN_SETTLEMENT" }, at(state.endsAtMs!)));
  state = expectState(reduceTable(state, { type: "FINALIZE" }, at(state.settlementDeadlineMs! - 1)));
  assert.equal(state.status, "SETTLED");
  assert.equal(state.financialStatus, "payouts_pending");
});

test("an invalid funded admission cancels the entire table", () => {
  let state = expectState(reduceTable(draftTable(), { type: "OPEN", openForMs: 60_000 }, at(0)));
  state = expectState(reduceTable(state, { type: "LOCK" }, at(1)));
  state = expectState(reduceTable(state, { type: "ACTIVATE", roster: [
    { wallet: "eligible", funded: true, admitted: true },
    { wallet: "invalid", funded: true, admitted: false },
  ] }, at(2)));
  assert.equal(state.status, "CANCELLED");
  assert.equal(state.financialStatus, "refunds_pending");
});

test("settlement deadline boundary refuses finalization and allows refund timeout", () => {
  const deadline = 10_000;
  const settling: TableRuntime = { ...draftTable(), status: "SETTLING", financialStatus: "funded", fundedPlayerCount: 2, settlementDeadlineMs: deadline };
  const finalization = reduceTable(settling, { type: "FINALIZE" }, at(deadline));
  assert.equal(finalization.ok, false);
  if (!finalization.ok) assert.equal(finalization.code, "SETTLEMENT_DEADLINE_REACHED");
  const timeout = reduceTable(settling, { type: "TIMEOUT" }, at(deadline));
  assert.equal(timeout.ok, true);
  assert.equal(timeout.state.status, "VOIDED");
  assert.equal(timeout.state.financialStatus, "refunds_pending");
});

test("open window cannot exceed ten minutes", () => {
  const result = reduceTable(draftTable(), { type: "OPEN", openForMs: TABLE_LIMITS.maximumOpenMs + 1 }, at(0));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "INVALID_OPEN_WINDOW");
});

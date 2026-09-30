import assert from "node:assert/strict";
import test from "node:test";
import { PriceTape } from "../../src/adapters/game/price-tape";

test("the tape turns sampled prices into candles and ignores bad prices", () => {
  let clock = Date.UTC(2026, 8, 30, 12, 0, 0);
  const tape = new PriceTape(() => clock);
  tape.record("M", null);
  tape.record("M", -1);
  assert.deepEqual(tape.candles("M", "1m"), []);
  for (const price of [1, 3, 2]) { tape.record("M", price); clock += 20_000; }
  clock += 60_000;
  tape.record("M", 4);
  const candles = tape.candles("M", "1m");
  assert.equal(candles.length, 2);
  assert.deepEqual({ open: candles[0]!.open, high: candles[0]!.high, low: candles[0]!.low, close: candles[0]!.close }, { open: 1, high: 3, low: 1, close: 2 });
  assert.equal(candles[1]!.open, 2, "a new candle opens at the last close");
  assert.equal(candles[1]!.close, 4);
  assert.equal(candles[1]!.volume, 0, "samples carry no volume");
});

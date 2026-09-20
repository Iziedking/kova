import test from "node:test";
import assert from "node:assert/strict";
import {
  directionOf,
  formatAge,
  formatAnsemRaw,
  formatClock,
  formatCompact,
  formatDuration,
  formatDurationShort,
  formatPct,
  formatSignedUsd,
  formatUsd,
  formatUsdPrice,
  shortAddress,
} from "../src/lib/format";

test("percentages always carry their sign so direction is never colour-only", () => {
  assert.equal(formatPct(12.4), "+12.4%");
  assert.equal(formatPct(-6.2), "-6.2%");
  assert.equal(formatPct(0), "0.0%");
  assert.equal(formatPct(0.04), "0.0%");
  assert.equal(formatPct(-0.04), "0.0%");
  assert.equal(formatPct(12.44, { digits: 0, signed: false }), "12%");
});

test("missing numbers render as an em dash, never as zero", () => {
  assert.equal(formatPct(null), "—");
  assert.equal(formatPct(undefined), "—");
  assert.equal(formatUsdPrice(null), "—");
  assert.equal(formatUsd(NaN), "—");
  assert.equal(formatCompact(Infinity), "—");
  assert.equal(formatAge(null), "—");
  assert.equal(formatDuration(null), "—");
  assert.equal(formatClock(null), "--:--");
});

test("price precision adapts so tiny meme-token prices stay readable", () => {
  assert.equal(formatUsdPrice(875.21), "$875.21");
  assert.equal(formatUsdPrice(0.0042), "$0.004200");
  assert.equal(formatUsdPrice(0.000012), "$0.00001200");
  assert.equal(formatUsdPrice(0.7123), "$0.7123");
  assert.equal(formatUsdPrice(1234.5), "$1,234.50");
});

test("compact numbers and signed dollars", () => {
  assert.equal(formatCompact(42_300_000), "42.3M");
  assert.equal(formatCompact(8_700_000_000), "8.7B");
  assert.equal(formatCompact(950), "950");
  assert.equal(formatUsd(-12.5, { cents: true }), "-$12.50");
  assert.equal(formatUsd(12843.32, { cents: true }), "$12,843.32");
  assert.equal(formatSignedUsd(1072.5), "+$1,072.50");
  assert.equal(formatSignedUsd(-186.76), "-$186.76");
});

test("ANSEM raw base units convert exactly, without floating point", () => {
  assert.equal(formatAnsemRaw("200000000"), "200 ANSEM");
  assert.equal(formatAnsemRaw("1500000", { unit: false }), "1.5");
  assert.equal(formatAnsemRaw("1"), "0.000001 ANSEM");
  assert.equal(formatAnsemRaw("123456789012345678901234567890"), "123,456,789,012,345,678,901,234.56789 ANSEM");
  assert.equal(formatAnsemRaw("0"), "0 ANSEM");
});

test("ANSEM raw values that are not canonical integers are refused", () => {
  for (const bad of ["", "-1", "1.5", "01", "1e6", "abc", null, undefined]) {
    assert.equal(formatAnsemRaw(bad as string | null | undefined), "—", `${String(bad)} must not format`);
  }
});

test("durations and countdown clocks", () => {
  assert.equal(formatDuration(28 * 60 + 14), "28m 14s");
  assert.equal(formatDuration(3600 + 12 * 60), "1h 12m");
  assert.equal(formatDuration(86400 + 4 * 3600), "1d 4h");
  assert.equal(formatDuration(45), "45s");
  assert.equal(formatDuration(-5), "0s");
  assert.equal(formatClock(8 * 60 + 42), "08:42");
  assert.equal(formatClock(3600 + 2 * 60 + 9), "1:02:09");
  assert.equal(formatDurationShort(900), "15m");
  assert.equal(formatDurationShort(3600), "1h");
  assert.equal(formatDurationShort(86400), "24h");
});

test("token age and address shortening", () => {
  assert.equal(formatAge(30 * 60), "30m");
  assert.equal(formatAge(7 * 3600), "7h");
  assert.equal(formatAge(3 * 86400), "3d");
  assert.equal(formatAge(3 * 7 * 86400), "3w");
  assert.equal(shortAddress("7F3aXk2Q9dPvB6mNhY4tLw8RzE1cUj5s9K2u"), "7F3a…9K2u");
  assert.equal(shortAddress("short"), "short");
});

test("direction treats a rounding-level move as flat", () => {
  assert.equal(directionOf(12.4), "up");
  assert.equal(directionOf(-0.5), "down");
  assert.equal(directionOf(0.01), "flat");
  assert.equal(directionOf(null), "none");
});

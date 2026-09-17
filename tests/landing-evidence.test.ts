/**
 * These checks are the enforcement mechanism for the honesty constraint in
 * .internal/PLAN-V4-UI-SYSTEM.md section 14: the public landing page must never
 * display a fabricated or stale market identity. They fail the build if landing
 * copy drifts from the domain catalog.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  LANDING_EVIDENCE,
  LANDING_CAPTURE_LABEL,
  FEATURED_MARKET,
  PINNED_POOL_OWNER,
} from "../src/design/landing-evidence";
import { MARKET_CATALOG } from "../src/domain/market-catalog";

test("the featured market is a real catalog entry, by identity not by copy", () => {
  assert.ok(MARKET_CATALOG.includes(FEATURED_MARKET));
});

test("every base58-shaped landing value is in the catalog or is a pinned observation", () => {
  const pinned = new Set([PINNED_POOL_OWNER]);
  const catalogValues = new Set<string>([
    FEATURED_MARKET.pool,
    FEATURED_MARKET.stockMint,
    FEATURED_MARKET.memeMint,
    FEATURED_MARKET.raydiumProgram,
    FEATURED_MARKET.stockProgramId,
    FEATURED_MARKET.memeProgramId,
  ]);
  const base58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  for (const fact of LANDING_EVIDENCE) {
    if (!base58.test(fact.value)) continue;
    assert.ok(
      catalogValues.has(fact.value) || pinned.has(fact.value),
      `landing fact ${fact.label} shows ${fact.value}, which is neither in the catalog nor a pinned observation`,
    );
  }
});

test("the landing states the featured pool, so the advertisement names a real market", () => {
  const pool = LANDING_EVIDENCE.find((fact) => fact.label === "POOL");
  assert.equal(pool?.value, FEATURED_MARKET.pool);
});

test("decimals shown on the landing match the catalog exactly", () => {
  const stock = LANDING_EVIDENCE.find((fact) => fact.label === "STOCK DECIMALS");
  const meme = LANDING_EVIDENCE.find((fact) => fact.label === "MEME DECIMALS");
  assert.equal(stock?.value, String(FEATURED_MARKET.stockDecimals));
  assert.equal(meme?.value, String(FEATURED_MARKET.memeDecimals));
});

test("no landing fact is empty, so an absent value is never rendered as filler", () => {
  for (const fact of LANDING_EVIDENCE) {
    assert.ok(fact.label.trim().length > 0, "every fact needs a label");
    assert.ok(fact.value.trim().length > 0, `fact ${fact.label} has an empty value`);
    assert.doesNotMatch(fact.value, /^[-—–?]+$/, `fact ${fact.label} renders a dash as if it were data`);
  }
});

test("the capture label names a date and states the read-only boundary", () => {
  assert.match(LANDING_CAPTURE_LABEL, /2026/);
  assert.match(LANDING_CAPTURE_LABEL, /READ ONLY/);
});

test("landing evidence carries no forbidden certainty language", () => {
  const forbidden = /\b(safe|guaranteed|organic|AI-approved)\b/i;
  for (const fact of LANDING_EVIDENCE) {
    assert.doesNotMatch(fact.label, forbidden);
    assert.doesNotMatch(fact.value, forbidden);
  }
});

test("landing facts are unique, so no value is silently duplicated under two labels", () => {
  const labels = LANDING_EVIDENCE.map((fact) => fact.label);
  assert.equal(new Set(labels).size, labels.length, "duplicate label in LANDING_EVIDENCE");
});

import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { resourceRequestKey } from "../src/hooks/use-resource";
import { PriceChart } from "../src/components/trading/price-chart";

test("guest and loading reads cannot remain cached after the viewer signs in", () => {
  const deps = ["settled-table"];
  const authed = { status: "authed" as const, userId: "player-a", walletAddress: null };
  for (const status of ["loading", "guest"] as const) {
    assert.notEqual(
      resourceRequestKey(deps, { status, userId: null, walletAddress: null }),
      resourceRequestKey(deps, authed),
    );
  }
});

test("switching accounts, signing out or changing wallets discards the previous account read", () => {
  const deps = ["portfolio", "1D"];
  const viewer = { status: "authed" as const, userId: "player-a", walletAddress: "wallet-a" };
  const original = resourceRequestKey(deps, viewer);
  assert.notEqual(original, resourceRequestKey(deps, { ...viewer, userId: "player-b" }));
  assert.notEqual(original, resourceRequestKey(deps, { status: "guest", userId: null, walletAddress: null }));
  assert.notEqual(original, resourceRequestKey(deps, { ...viewer, walletAddress: "wallet-b" }));
});

test("a stable session retains its read until the actual request changes", () => {
  const viewer = { status: "authed" as const, userId: "player-a", walletAddress: "wallet-a" };
  assert.equal(resourceRequestKey(["mint", "1h"], viewer), resourceRequestKey(["mint", "1h"], { ...viewer }));
  assert.notEqual(resourceRequestKey(["mint", "1h"], viewer), resourceRequestKey(["mint", "1d"], viewer));
});

test("an empty price response renders an accessible explanation instead of a blank chart", () => {
  const html = renderToStaticMarkup(createElement(PriceChart, { candles: [], timeframe: "1h", symbol: "GME" }));
  assert.match(html, /role="status"/);
  assert.match(html, /No price history is available for this market yet/);
  assert.doesNotMatch(html, /<svg/);
});


test("principal-only table reads survive wallet connection but invalidate on account changes", () => {
  const viewer = { status: "authed" as const, userId: "player-a", walletAddress: null };
  const key = resourceRequestKey(["table"], viewer, false);
  assert.equal(resourceRequestKey(["table"], { ...viewer, walletAddress: "connected-wallet" }, false), key);
  assert.notEqual(resourceRequestKey(["table"], { ...viewer, userId: "player-b" }, false), key);
  assert.notEqual(resourceRequestKey(["table"], { ...viewer, status: "guest" }, false), key);
});

import test from "node:test";
import assert from "node:assert/strict";
import { isProtectedPath, PROTECTED_PREFIXES } from "../src/auth/protected-routes";
import { loginHref, safeNext } from "../src/auth/redirect";

test("guests can browse the lobby, markets, leaderboard, profiles and tables", () => {
  for (const path of [
    "/",
    "/login",
    "/legal/risk",
    "/app",
    "/play",
    "/tables/018f7f5e-7b1a-4d40-8a41-8dd5f8108f02",
    "/markets",
    "/markets/So11111111111111111111111111111111111111112",
    "/leaderboard",
    "/profile/ansem",
  ]) {
    assert.equal(isProtectedPath(path), false, `${path} must stay public`);
  }
});

test("portfolio, settings and notifications require a session", () => {
  assert.equal(isProtectedPath("/portfolio"), true);
  assert.equal(isProtectedPath("/portfolio/"), true);
  assert.equal(isProtectedPath("/portfolio/activity"), true);
  assert.equal(isProtectedPath("/settings"), true);
  assert.equal(isProtectedPath("/notifications"), true);
});

test("a prefix matches only on a segment boundary, so no route is protected by accident", () => {
  assert.equal(isProtectedPath("/portfolios"), false);
  assert.equal(isProtectedPath("/settings-help"), false);
});

test("every declared prefix is absolute and carries no trailing slash", () => {
  for (const prefix of PROTECTED_PREFIXES) {
    assert.ok(prefix.startsWith("/"), `${prefix} must be absolute`);
    assert.ok(!prefix.endsWith("/"), `${prefix} must not end with a slash`);
  }
});

test("safeNext keeps same-origin application paths, including a query string", () => {
  assert.equal(safeNext("/markets/abc?tab=trades"), "/markets/abc?tab=trades");
  assert.equal(safeNext("/tables/1?intent=join"), "/tables/1?intent=join");
  assert.equal(safeNext("/play?mode=trade"), "/play?mode=trade");
});

test("safeNext refuses anything that could leave the origin", () => {
  for (const hostile of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "evil.example",
    "/ok\nSet-Cookie: x=1",
    `/${"a".repeat(600)}`,
  ]) {
    assert.equal(safeNext(hostile), "/app", `${JSON.stringify(hostile.slice(0, 30))} must fall back`);
  }
});

test("safeNext never returns to the login page or the API", () => {
  assert.equal(safeNext("/login"), "/app");
  assert.equal(safeNext("/login?next=/x"), "/app");
  assert.equal(safeNext("/api/game/tables"), "/app");
});

test("safeNext honours an explicit fallback and treats empty input as absent", () => {
  assert.equal(safeNext(null), "/app");
  assert.equal(safeNext(""), "/app");
  assert.equal(safeNext("//x", "/markets"), "/markets");
});

test("loginHref preserves the intended destination and reason", () => {
  assert.equal(loginHref("/portfolio", "required"), "/login?next=%2Fportfolio&reason=required");
  assert.equal(loginHref("/tables/1?intent=join"), "/login?next=%2Ftables%2F1%3Fintent%3Djoin");
  assert.equal(loginHref("//evil.example"), "/login");
  assert.equal(loginHref(null, "expired"), "/login?reason=expired");
});

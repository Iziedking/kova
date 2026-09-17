import test from "node:test";
import assert from "node:assert/strict";
import { isProtectedPath, PROTECTED_PREFIXES } from "../src/auth/protected-routes";

test("the app home and market reading stay open while signed out", () => {
  assert.equal(isProtectedPath("/"), false);
  assert.equal(isProtectedPath("/login"), false);
  assert.equal(isProtectedPath("/legal/risk"), false);
  assert.equal(isProtectedPath("/app"), false);
  assert.equal(isProtectedPath("/app/markets"), false);
  assert.equal(isProtectedPath("/app/markets/nvdge-nvdax"), false);
});

test("backing, positions, autopilot and workspace require a session", () => {
  assert.equal(isProtectedPath("/app/markets/nvdge-nvdax/back/capital"), true);
  assert.equal(isProtectedPath("/app/positions"), true);
  assert.equal(isProtectedPath("/app/autopilot"), true);
  assert.equal(isProtectedPath("/app/workspace"), true);
  assert.equal(isProtectedPath("/app/workspace/wallets"), true);
  assert.equal(isProtectedPath("/app/campaigns/new/pool"), true);
});

test("a prefix matches only on a segment boundary, so no route is protected by accident", () => {
  assert.equal(isProtectedPath("/app/positionsomething"), false);
  assert.equal(isProtectedPath("/app/workspaces"), false);
});

test("campaign browsing is open but campaign creation is not", () => {
  assert.equal(isProtectedPath("/app/campaigns"), false);
  assert.equal(isProtectedPath("/app/campaigns/new"), true);
});

test("every declared prefix is absolute and carries no trailing slash", () => {
  for (const prefix of PROTECTED_PREFIXES) {
    assert.ok(prefix.startsWith("/"), `${prefix} must be absolute`);
    assert.ok(!prefix.endsWith("/"), `${prefix} must not end with a slash`);
  }
});

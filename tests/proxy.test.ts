import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

function call(path: string, cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return proxy(new NextRequest(`http://localhost:3000${path}`, { headers }));
}

test("a guest hitting a personal route is redirected to sign in with the path and reason preserved", () => {
  const response = call("/portfolio?tab=activity");
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "http://localhost:3000/login?next=%2Fportfolio%3Ftab%3Dactivity&reason=required");
});

test("each protected surface redirects a guest", () => {
  for (const path of ["/portfolio", "/settings", "/notifications", "/portfolio/activity"]) {
    assert.equal(call(path).status, 307, path);
  }
});

test("a session cookie lets the request through to the page, which verifies it server-side", () => {
  const response = call("/portfolio", "privy-token=opaque-token");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
});

test("public routes are never redirected", () => {
  for (const path of ["/", "/app", "/play", "/markets", "/leaderboard", "/profile/ansem", "/tables/abc", "/login"]) {
    assert.equal(call(path).headers.get("location"), null, path);
  }
});

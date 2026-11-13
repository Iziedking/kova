import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { isNearHost, nearHostRewrite } from "../../src/features/near/host-routing";
import { proxy } from "../../src/proxy";

test("only near.* hosts are the NEAR host", () => {
  for (const host of ["near.kova.surf", "near.localhost:3000", "NEAR.kova.surf"]) assert.ok(isNearHost(host), host);
  for (const host of ["kova.surf", "www.kova.surf", "nearby.kova.surf", "localhost:3000", "", null]) assert.ok(!isNearHost(host), String(host));
});

test("NEAR pages are served from /near, and kova.surf pages land on the NEAR 404", () => {
  assert.equal(nearHostRewrite("/"), "/near");
  assert.equal(nearHostRewrite("/play"), "/near/play");
  assert.equal(nearHostRewrite("/play/"), "/near/play");
  assert.equal(nearHostRewrite("/t/42"), "/near/t/42");
  assert.equal(nearHostRewrite("/c/red"), "/near/c/red");
  // The Solana product's pages are not served on the NEAR host; /near has no such page, so it 404s.
  for (const path of ["/markets", "/leaderboard", "/login", "/legal/risk", "/api/game/tables", "/opengraph-image"]) assert.equal(nearHostRewrite(path), `/near${path}`, path);
});

test("NEAR routes, its API, build files, robots, sitemap and static files pass through", () => {
  for (const path of ["/near", "/near/play", "/near/opengraph-image", "/api/near/house", "/_next/data/x.json", "/robots.txt", "/sitemap.xml", "/icon.jpg", "/favicon.ico", "/near/chip-supply.svg"]) {
    assert.equal(nearHostRewrite(path), null, path);
  }
});

function call(url: string) {
  const host = new URL(url).host;
  return proxy(new NextRequest(url, { headers: new Headers({ host }) }));
}

test("the proxy rewrites on the NEAR host and leaves kova.surf alone", () => {
  assert.equal(call("https://near.kova.surf/markets").headers.get("x-middleware-rewrite"), "https://near.kova.surf/near/markets");
  assert.equal(call("https://near.kova.surf/play").headers.get("x-middleware-rewrite"), "https://near.kova.surf/near/play");
  assert.equal(call("https://near.kova.surf/api/near/house").headers.get("x-middleware-rewrite"), null);
  assert.equal(call("https://kova.surf/markets").headers.get("x-middleware-rewrite"), null);
  // A personal kova.surf page still redirects a guest to sign in.
  assert.equal(call("https://kova.surf/portfolio").status, 307);
});

/**
 * The bundle scanner is a safety net, so its precision is worth testing.
 *
 * The private-key marker was loosened from an exact header match to a pattern
 * after Privy's bundled JOSE library produced a false positive. These checks
 * prove the loosening did not disable real detection.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { findViolations, MARKERS } from "../scripts/client-bundle-markers";

test("catches real PEM key material", () => {
  const leaked =
    "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDabc123defGHI\n-----END PRIVATE KEY-----";
  assert.deepEqual(findViolations(leaked), ["PEM private key material"]);
});

test("catches an escaped PEM key on one line, as a bundler would emit it", () => {
  const leaked =
    '"-----BEGIN RSA PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDabc123defGHIjk\\n"';
  assert.deepEqual(findViolations(leaked), ["PEM private key material"]);
});

test("does not flag PEM format-parsing code, which is why the marker is a pattern", () => {
  // The exact shape found in the JOSE library Privy bundles for JWT verification.
  const libraryCode =
    'if("string"!=typeof e||0!==e.indexOf("-----BEGIN PRIVATE KEY-----"))throw TypeError(\'"pkcs8" must be PKCS#8 formatted string\');return el(/(?:-----(?:BEGIN|END) PRIVATE KEY-----|\\s)/g,"pkcs8",e,t,i)';
  assert.deepEqual(findViolations(libraryCode), []);
});

test("still catches every server-only environment marker", () => {
  assert.deepEqual(findViolations("const x = process.env.PRIVY_APP_SECRET"), ["PRIVY_APP_SECRET"]);
  assert.deepEqual(findViolations("KOVA_SOLANA_RPC_URL"), ["KOVA_SOLANA_RPC_URL"]);
  assert.deepEqual(findViolations("KOVA_DATABASE_URL"), ["KOVA_DATABASE_URL"]);
  assert.deepEqual(findViolations("KOVA_POSTGRES_PASSWORD"), ["KOVA_POSTGRES_PASSWORD"]);
  assert.deepEqual(findViolations("KOVA_PICK_ENCRYPTION_KEY"), ["KOVA_PICK_ENCRYPTION_KEY"]);
  assert.deepEqual(findViolations("CLAWPUMP_API_KEY"), ["CLAWPUMP_API_KEY"]);
  assert.deepEqual(findViolations("postgresql://kova:pw@host/db"), ["postgresql://"]);
});

test("the public app id is not a violation, since it ships in the bundle by design", () => {
  assert.deepEqual(findViolations("NEXT_PUBLIC_PRIVY_APP_ID"), []);
});

test("clean content yields nothing, and every marker is named", () => {
  assert.deepEqual(findViolations("export const a = 1;"), []);
  for (const marker of MARKERS) {
    assert.ok(marker.name.trim().length > 0);
  }
});

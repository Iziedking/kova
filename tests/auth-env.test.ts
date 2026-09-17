import test from "node:test";
import assert from "node:assert/strict";
import { readPrivyAppId, isPrivyConfigured } from "../src/auth/privy-env";

test("reports configured only when both the public app id and the secret are present", () => {
  assert.equal(isPrivyConfigured({ NEXT_PUBLIC_PRIVY_APP_ID: "abc", PRIVY_APP_SECRET: "s" }), true);
  assert.equal(isPrivyConfigured({ NEXT_PUBLIC_PRIVY_APP_ID: "abc" }), false);
  assert.equal(isPrivyConfigured({ PRIVY_APP_SECRET: "s" }), false);
  assert.equal(isPrivyConfigured({}), false);
});

test("treats blank and whitespace-only values as absent, not configured", () => {
  assert.equal(isPrivyConfigured({ NEXT_PUBLIC_PRIVY_APP_ID: "   ", PRIVY_APP_SECRET: "s" }), false);
  assert.equal(readPrivyAppId({ NEXT_PUBLIC_PRIVY_APP_ID: "  " }), null);
});

test("returns the trimmed app id", () => {
  assert.equal(readPrivyAppId({ NEXT_PUBLIC_PRIVY_APP_ID: " abc " }), "abc");
  assert.equal(readPrivyAppId({}), null);
});

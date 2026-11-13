import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { KeyPair } from "near-api-js";
import { loadNearConfig } from "../../src/backend/near/config";

function keyFile(dir: string, name: string): string {
  const path = join(dir, name);
  writeFileSync(path, KeyPair.fromRandom("ed25519").toString());
  return path;
}

function base(dir: string): Record<string, string> {
  return {
    KOVA_NEAR_ENABLED: "true",
    NEAR_CHIP_CONTRACT: "kova-chip.testnet",
    NEAR_SETTLER_ACCOUNT: "settler.kingizie.testnet",
    NEAR_SETTLER_KEY_FILE: keyFile(dir, "settler.key"),
    NEAR_HOUSE_ACCOUNT: "house.kingizie.testnet",
    NEAR_HOUSE_KEY_FILE: keyFile(dir, "house.key"),
  };
}

test("settings compose passes as empty strings count as unset, so email sign-in is simply off", () => {
  const dir = mkdtempSync(join(tmpdir(), "near-config-"));
  const config = loadNearConfig({ ...base(dir), NEAR_SPONSOR_ACCOUNT: "", NEAR_EMAIL_FUND_YOCTO: "", NEAR_EMAIL_DAILY_CAP: "", NEAR_RPC_URL: "", NEAR_AI_API_KEY_FILE: "" });
  assert.ok(config);
  assert.equal(config.email, null);
});

test("a sponsor account and key file turn email funding on with the defaults", () => {
  const dir = mkdtempSync(join(tmpdir(), "near-config-"));
  const config = loadNearConfig({ ...base(dir), NEAR_SPONSOR_ACCOUNT: "kova-sponsor.testnet", NEAR_SPONSOR_KEY_FILE: keyFile(dir, "sponsor.key") });
  assert.equal(config?.email?.sponsorAccount, "kova-sponsor.testnet");
  assert.equal(config?.email?.fundYocto, 10n ** 23n);
  assert.equal(config?.email?.dailyCap, 50);
});

import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@solana/web3.js";
import { createMandate, PRIVY_POLICY_VERSION } from "../src/application/mandate";

const wallet = Keypair.generate().publicKey.toBase58();
const base = {
  id: "mandate-1", wallet, allowedPools: [Keypair.generate().publicKey.toBase58()], allowedPrograms: [Keypair.generate().publicKey.toBase58()], allowedMints: [Keypair.generate().publicKey.toBase58()], maxPositionUsdMicro: "1000000", maxSlippageBps: 50, returnAddress: wallet, expiresAt: "2026-09-16T00:00:00.000Z",
};

test("creates a delegated mandate with a pinned policy version", () => {
  const result = createMandate(base, "2026-09-15T00:00:00.000Z");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.policyVersion, PRIVY_POLICY_VERSION);
});

test("rejects a recovery address that differs from the wallet", () => {
  const result = createMandate({ ...base, returnAddress: Keypair.generate().publicKey.toBase58() }, "2026-09-15T00:00:00.000Z");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "INVALID_MANDATE");
});

test("rejects a malformed expiresAt instead of comparing it as a raw string", () => {
  const result = createMandate({ ...base, expiresAt: "not-a-date" }, "2026-09-15T00:00:00.000Z");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "INVALID_MANDATE");
});

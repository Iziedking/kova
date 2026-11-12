/**
 * Generates the settler and House keys for a CHIP deployment and writes them to .env.near
 * (ignored by Git). Prints only the public keys, which go into the account-creation commands.
 *
 *   npx tsx scripts/near/new-service-keys.ts <root-account>
 *
 * Refuses to overwrite an existing .env.near so a live key is never replaced by accident.
 */
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { KeyPair } from "near-api-js";

const root = process.argv[2];
if (!root || !/^[a-z0-9._-]+\.(testnet|near)$/.test(root)) {
  console.error("Usage: npx tsx scripts/near/new-service-keys.ts <root-account, e.g. kingizie.testnet>");
  process.exit(2);
}
const file = resolve(process.cwd(), ".env.near");
if (existsSync(file)) {
  console.error(".env.near already exists. Move it aside first if you really mean to replace these keys.");
  process.exit(2);
}
const network = root.endsWith(".testnet") ? "testnet" : "mainnet";
const settler = KeyPair.fromRandom("ed25519");
const house = KeyPair.fromRandom("ed25519");
writeFileSync(
  file,
  [
    `# Generated ${new Date().toISOString()}. Never commit this file.`,
    `NEAR_NETWORK=${network}`,
    `NEAR_CHIP_CONTRACT=chip.${root}`,
    `NEAR_SETTLER_ACCOUNT=settler.${root}`,
    `NEAR_SETTLER_KEY=${settler.toString()}`,
    `NEAR_HOUSE_ACCOUNT=house.${root}`,
    `NEAR_HOUSE_KEY=${house.toString()}`,
    "",
  ].join("\n"),
  { flag: "wx", mode: 0o600 },
);
console.log(`Wrote ${file}`);
console.log(`settler.${root} public key: ${settler.getPublicKey().toString()}`);
console.log(`house.${root} public key: ${house.getPublicKey().toString()}`);

import assert from "node:assert/strict";
import test from "node:test";
import { StandardConnect, type StandardConnectFeature } from "@wallet-standard/features";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { connectSolanaWallet, filterSolanaWallets, selectSolanaAccount, selectSolanaChain, type DiscoveredWallet } from "../src/wallet/standard";

const account = (address: string, chains: WalletAccount["chains"]): WalletAccount => ({
  address,
  publicKey: new Uint8Array(32),
  chains,
  features: [],
});

function wallet(name: string, chains: Wallet["chains"], feature?: StandardConnectFeature[typeof StandardConnect]): Wallet {
  return {
    version: "1.0.0",
    name,
    icon: "data:image/svg+xml;base64,AA==",
    chains,
    features: feature === undefined ? {} : { [StandardConnect]: feature },
    accounts: [],
  };
}

function discovered(value: Wallet): DiscoveredWallet {
  return { name: value.name, icon: value.icon, chains: value.chains, wallet: value };
}

test("wallet registry projection keeps only Solana wallets", () => {
  const solana = wallet("Solana Wallet", ["solana:mainnet"]);
  const ethereum = wallet("Ethereum Wallet", ["eip155:1"]);
  assert.deepEqual(filterSolanaWallets([solana, ethereum]).map((item) => item.name), ["Solana Wallet"]);
});

test("account and chain selection prefer mainnet and reject unrelated chains", () => {
  const devnet = account("devnet-address", ["solana:devnet"]);
  const mainnet = account("mainnet-address", ["solana:mainnet"]);
  assert.equal(selectSolanaAccount([account("eth-address", ["eip155:1"]), devnet, mainnet])?.address, "devnet-address");
  assert.equal(selectSolanaChain(["solana:devnet", "solana:mainnet"]), "solana:mainnet");
  assert.equal(selectSolanaChain(["eip155:1"]), null);
});

test("connection returns the selected account and never requires a signing feature", async () => {
  let connectCalls = 0;
  const feature: StandardConnectFeature[typeof StandardConnect] = {
    version: "1.0.0",
    connect: async () => {
      connectCalls += 1;
      return { accounts: [account("solana-address", ["solana:mainnet"])] };
    },
  };
  const result = await connectSolanaWallet(discovered(wallet("Safe Wallet", ["solana:mainnet"], feature)));
  assert.equal(connectCalls, 1);
  assert.deepEqual(result, { ok: true, value: { walletName: "Safe Wallet", address: "solana-address", chain: "solana:mainnet" } });
});

test("connection refuses missing accounts, missing feature, and rejection without transaction work", async () => {
  const noAccountFeature: StandardConnectFeature[typeof StandardConnect] = { version: "1.0.0", connect: async () => ({ accounts: [] }) };
  const noAccount = await connectSolanaWallet(discovered(wallet("Empty Wallet", ["solana:mainnet"], noAccountFeature)));
  assert.equal(noAccount.ok, false);
  if (!noAccount.ok) assert.equal(noAccount.code, "SOLANA_ACCOUNT_NOT_FOUND");

  const unavailable = await connectSolanaWallet(discovered(wallet("Read Only Wallet", ["solana:mainnet"])));
  assert.equal(unavailable.ok, false);
  if (!unavailable.ok) assert.equal(unavailable.code, "WALLET_CONNECT_UNAVAILABLE");

  const rejectingFeature: StandardConnectFeature[typeof StandardConnect] = { version: "1.0.0", connect: async () => { throw new Error("rejected"); } };
  const rejected = await connectSolanaWallet(discovered(wallet("Rejected Wallet", ["solana:mainnet"], rejectingFeature)));
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.code, "WALLET_CONNECTION_REJECTED");
    assert.match(rejected.message, /No transaction was requested/);
  }
});

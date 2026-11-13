import assert from "node:assert/strict";
import { test } from "node:test";
import { actions, createTransaction, KeyPair, keyToImplicitAddress } from "near-api-js";
import { EmailWalletSigner, fundingHash, implicitPublicKey, isImplicitAccount, toHex, verifyFundingProof } from "../../src/adapters/near/email-wallet";
import { EmailAccountFunder, MemoryEmailFundingStore } from "../../src/backend/near/email-accounts";

const NETWORK = "testnet";
const CONTRACT = "kova-chip.testnet";
const NEAR = 10n ** 24n;
const FUND = 3n * 10n ** 23n;

/** A stand-in for Privy's wallet: a key pair whose implicit account is the email account. */
function wallet() {
  const key = KeyPair.fromRandom("ed25519");
  const accountId = keyToImplicitAddress(key.getPublicKey());
  const signHash = async (hash: string) => `0x${toHex(key.sign(Uint8Array.from(Buffer.from(hash.slice(2), "hex"))).signature)}`;
  return { key, accountId, signHash };
}

async function proof(w: ReturnType<typeof wallet>, privyUserId: string) {
  const hash = await fundingHash({ privyUserId, accountId: w.accountId, network: NETWORK, contractId: CONTRACT });
  return w.signHash(`0x${toHex(hash)}`);
}

test("an implicit account is its own public key, and named accounts are refused", () => {
  const w = wallet();
  assert.ok(isImplicitAccount(w.accountId));
  assert.equal(implicitPublicKey(w.accountId).toString(), w.key.getPublicKey().toString());
  assert.throws(() => implicitPublicKey("alice.testnet"), /not a NEAR implicit account/);
  assert.equal(isImplicitAccount("A".repeat(64)), false);
});

test("the email wallet signs a transaction that verifies against the account's key", async () => {
  const w = wallet();
  const signer = new EmailWalletSigner(w.accountId, w.signHash);
  const gameKey = KeyPair.fromRandom("ed25519");
  const tx = createTransaction(w.accountId, await signer.getPublicKey(), w.accountId, 1n, [actions.addFunctionCallAccessKey(gameKey.getPublicKey(), CONTRACT, ["claim_starter"], NEAR / 4n)], new Uint8Array(32));
  const { txHash, signedTransaction } = await signer.signTransaction(tx);
  const data = signedTransaction.signature.signature?.data;
  assert.ok(data && w.key.getPublicKey().verify(txHash, data));
});

test("a signature from some other key is refused before anything is sent", async () => {
  const w = wallet();
  const other = wallet();
  const signer = new EmailWalletSigner(w.accountId, other.signHash);
  const tx = createTransaction(w.accountId, await signer.getPublicKey(), CONTRACT, 1n, [actions.transfer(1n)], new Uint8Array(32));
  await assert.rejects(signer.signTransaction(tx), /does not match its account/);
});

test("the funding proof is bound to the login", async () => {
  const w = wallet();
  const signature = await proof(w, "did:privy:alice");
  assert.ok(await verifyFundingProof({ privyUserId: "did:privy:alice", accountId: w.accountId, network: NETWORK, contractId: CONTRACT, signature }));
  assert.equal(await verifyFundingProof({ privyUserId: "did:privy:mallory", accountId: w.accountId, network: NETWORK, contractId: CONTRACT, signature }), false);
  assert.equal(await verifyFundingProof({ privyUserId: "did:privy:alice", accountId: w.accountId, network: "mainnet", contractId: CONTRACT, signature }), false);
  assert.equal(await verifyFundingProof({ privyUserId: "did:privy:alice", accountId: w.accountId, network: NETWORK, contractId: CONTRACT, signature: "0x00" }), false);
});

type Harness = {
  funder: EmailAccountFunder;
  store: MemoryEmailFundingStore;
  transfers: { receiverId: string; amount: bigint }[];
  balances: Map<string, bigint>;
  failNext: { value: boolean };
  clock: { now: Date };
};

function harness(dailyCap = 3): Harness {
  const clock = { now: new Date("2026-11-13T12:00:00Z") };
  const store = new MemoryEmailFundingStore(() => clock.now);
  const transfers: { receiverId: string; amount: bigint }[] = [];
  const balances = new Map<string, bigint>();
  const failNext = { value: false };
  const funder = new EmailAccountFunder({
    verifyToken: async (token) => (token.startsWith("token:") ? { userId: token.slice(6) } : null),
    sponsor: {
      accountId: "sponsor.testnet",
      transfer: (async ({ receiverId, amount }: { receiverId: string; amount: bigint }) => {
        if (failNext.value) {
          failNext.value = false;
          throw new Error("rpc down");
        }
        transfers.push({ receiverId, amount });
        balances.set(receiverId, (balances.get(receiverId) ?? 0n) + amount);
        return { transaction: { hash: `tx${transfers.length}` } };
      }) as never,
    },
    provider: {
      viewAccount: (async ({ accountId }: { accountId: string }) => {
        const amount = balances.get(accountId);
        if (amount === undefined) throw new Error("does not exist");
        return { amount: amount.toString() };
      }) as never,
    },
    store,
    network: NETWORK,
    contractId: CONTRACT,
    amount: FUND,
    dailyCap,
    explorerTx: (hash) => `https://testnet.nearblocks.io/txns/${hash}`,
    clock: () => clock.now,
  });
  return { funder, store, transfers, balances, failNext, clock };
}

test("a new email account is funded once, and asking again pays nothing", async () => {
  const h = harness();
  const w = wallet();
  const signature = await proof(w, "alice");
  const first = await h.funder.fund({ token: "token:alice", accountId: w.accountId, signature });
  assert.deepEqual(first, { ok: true, accountId: w.accountId, funded: true, txHash: "tx1", explorerUrl: "https://testnet.nearblocks.io/txns/tx1" });
  const again = await h.funder.fund({ token: "token:alice", accountId: w.accountId, signature });
  assert.equal(again.ok && again.funded, false);
  assert.equal(h.transfers.length, 1);
  assert.equal(h.transfers[0]?.amount, FUND);
});

test("no login, a bad proof, or someone else's account gets nothing", async () => {
  const h = harness();
  const w = wallet();
  const signature = await proof(w, "alice");
  assert.equal((await h.funder.fund({ token: null, accountId: w.accountId, signature })).ok, false);
  const expired = await h.funder.fund({ token: "expired", accountId: w.accountId, signature });
  assert.ok(!expired.ok && expired.status === 401);
  // Mallory replays Alice's proof under her own login.
  const replay = await h.funder.fund({ token: "token:mallory", accountId: w.accountId, signature });
  assert.ok(!replay.ok && replay.status === 403);
  const named = await h.funder.fund({ token: "token:alice", accountId: "alice.testnet", signature });
  assert.ok(!named.ok && named.status === 400);
  assert.equal(h.transfers.length, 0);
});

test("one login cannot fund a second account", async () => {
  const h = harness();
  const a = wallet();
  const b = wallet();
  await h.funder.fund({ token: "token:alice", accountId: a.accountId, signature: await proof(a, "alice") });
  const second = await h.funder.fund({ token: "token:alice", accountId: b.accountId, signature: await proof(b, "alice") });
  assert.ok(!second.ok && second.status === 409);
  assert.equal(h.transfers.length, 1);
});

test("the daily cap stops new accounts until the next UTC day", async () => {
  const h = harness(2);
  for (const user of ["a", "b"]) {
    const w = wallet();
    assert.equal((await h.funder.fund({ token: `token:${user}`, accountId: w.accountId, signature: await proof(w, user) })).ok, true);
  }
  const w = wallet();
  const capped = await h.funder.fund({ token: "token:c", accountId: w.accountId, signature: await proof(w, "c") });
  assert.ok(!capped.ok && capped.status === 429);
  h.clock.now = new Date("2026-11-14T00:00:01Z");
  assert.equal((await h.funder.fund({ token: "token:c", accountId: w.accountId, signature: await proof(w, "c") })).ok, true);
  assert.equal(h.transfers.length, 3);
});

test("an account that already holds NEAR is recorded but not paid", async () => {
  const h = harness();
  const w = wallet();
  h.balances.set(w.accountId, NEAR);
  const result = await h.funder.fund({ token: "token:alice", accountId: w.accountId, signature: await proof(w, "alice") });
  assert.ok(result.ok && !result.funded);
  assert.equal(h.transfers.length, 0);
  assert.equal(h.store.rows.size, 1);
});

test("a failed transfer frees the login to try again, and the retry pays once", async () => {
  const h = harness();
  const w = wallet();
  const signature = await proof(w, "alice");
  h.failNext.value = true;
  const failed = await h.funder.fund({ token: "token:alice", accountId: w.accountId, signature });
  assert.ok(!failed.ok && failed.status === 502);
  assert.equal(h.store.rows.size, 0);
  const retried = await h.funder.fund({ token: "token:alice", accountId: w.accountId, signature });
  assert.ok(retried.ok && retried.funded);
  assert.equal(h.transfers.length, 1);
});

test("a reservation whose transfer never landed is paid after two minutes, not before", async () => {
  const h = harness();
  const w = wallet();
  const signature = await proof(w, "alice");
  // The server stopped after recording the intent and before sending.
  await h.store.reserve({ privyUserId: "alice", accountId: w.accountId, amount: FUND });
  const soon = await h.funder.fund({ token: "token:alice", accountId: w.accountId, signature });
  assert.ok(soon.ok && !soon.funded);
  assert.equal(h.transfers.length, 0);
  h.clock.now = new Date(h.clock.now.getTime() + 3 * 60_000);
  const later = await h.funder.fund({ token: "token:alice", accountId: w.accountId, signature });
  assert.ok(later.ok && later.funded);
  assert.equal(h.transfers.length, 1);
  const done = await h.funder.fund({ token: "token:alice", accountId: w.accountId, signature });
  assert.ok(done.ok && !done.funded);
  assert.equal(h.transfers.length, 1);
});

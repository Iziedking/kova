import assert from "node:assert/strict";
import test from "node:test";
import { ClawPumpTradingClient } from "../../src/adapters/game/clawpump-trading";

const inputMint = "So11111111111111111111111111111111111111112";
const outputMint = "8wXtPeU6557ETkp9WHFY1n1EcU6NxDvbAggHGsMYiHsB";

test("ClawPump quote uses documented apex host and snake_case swap fields", async () => {
  let url = "";
  let body: Record<string, unknown> = {};
  const client = new ClawPumpTradingClient({ apiKey: "cpk_test", fetcher: async (input, init) => {
    url = String(input);
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ route: "fixture", meta: { requestId: "quote-1" } }), { status: 200 });
  } });
  const result = await client.quote({ inputMint, outputMint, amountUi: "0.25", slippageBps: 75, agentId: "agent-1" });
  assert.equal(url, "https://clawpump.tech/api/v1/swap/quote");
  assert.deepEqual(body, { input_mint: inputMint, output_mint: outputMint, amount: "0.25", slippage_bps: 75, agent_id: "agent-1" });
  assert.equal(result.requestId, "quote-1");
});

test("ClawPump preparation returns an unsigned transaction and never broadcasts", async () => {
  let url = "";
  let body: Record<string, unknown> = {};
  const client = new ClawPumpTradingClient({ apiKey: "cpk_test", fetcher: async (input, init) => {
    url = String(input);
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ unsignedTransaction: "base64-tx", inputAmount: "250000", meta: { requestId: "prepare-1" } }), { status: 200 });
  } });
  const result = await client.prepareUnsignedSwap({ inputMint, outputMint, amountUi: "0.25", agentId: "agent-1", agentWalletAddress: inputMint, userWallet: inputMint, acknowledgeUnverified: true });
  assert.equal(url, "https://clawpump.tech/api/v1/swap/execute");
  assert.equal(body.agent_id, "agent-1");
  assert.equal(body.user_wallet, inputMint);
  assert.equal(body.acknowledgeUnverified, true);
  assert.equal(result.unsignedTransaction, "base64-tx");
});

test("ClawPump adapter rejects cross-wallet execution requests", async () => {
  const client = new ClawPumpTradingClient({ apiKey: "cpk_test", fetcher: async () => new Response("{}", { status: 200 }) });
  await assert.rejects(() => client.prepareUnsignedSwap({ inputMint, outputMint, amountUi: "0.25", agentId: "agent-1", agentWalletAddress: inputMint, userWallet: outputMint }), /must equal the agent wallet/);
});

test("ClawPump adapter refuses a key that is not a partner key", () => {
  assert.throws(() => new ClawPumpTradingClient({ apiKey: "not-a-key" }), /cpk_/);
});

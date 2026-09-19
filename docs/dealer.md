# KOVA Dealer boundary

The Dealer classifies whether an exact Solana mint is eligible for KOVA's stock-themed meme category. It does not pick for a player, price a round, choose a winner, sign, trade, transfer, post, automate, or control funds.

## Implemented locally

- Finalized exact-mint identity reads through Solana RPC.
- Exact-mint pair discovery through DEX Screener's `token-pairs/v1` endpoint.
- A server-only ClawPump Partner API adapter using the apex host, a 120-second timeout, no blind retry, and strict response validation.
- A strict `kova-admission-v1` schema and a separate deterministic acceptance gate.
- Confidence ceilings tied to authoritative reads, independent source classes, primary evidence, and unresolved conflicts.
- Encrypted PostgreSQL cache records and provider receipts with key rotation support.
- A sanitized public projection that omits token identity internals, provider receipts, and encrypted material.

The read-only evidence probe is:

```text
npm run probe:admission -- <exact-solana-mint>
```

It does not invoke ClawPump, a wallet, or a transaction API.

## Live ClawPump finding

The private KOVA Dealer agent and custom skill were inspected on 19 September 2026. The agent was changed from public/listed to private/not-for-sale. Its requested skills were narrowed to market intelligence, news, and Bitget intelligence.

ClawPump still reports always-on capabilities including wallet/financial surfaces. Its official Partner API documentation says the base bundle includes wallet, x402, perps, and other capabilities, and warns that a chat turn may invoke tools before returning. The current API does not document a per-request tool allowlist. The agent therefore has only a prompt-level safety boundary, not hard capability isolation.

Five live, free, read-only probes were run with paid fallback disabled. No wallet, transfer, posting, automation, or paid tool was invoked. The results were useful but not production-valid:

- an exact GME mint request returned `INSUFFICIENT_EVIDENCE` and used only Bitget/news tools, but one field had the wrong JSON type and confidence exceeded the evidence ceiling;
- two requests containing caller evidence drifted into shortened, non-contract output;
- a Wrapped SOL spoof correctly said `REJECTED`, but encoded `null` as a string and again exceeded the confidence ceiling.

The backend rejects all of those outputs. It never repairs malformed output into admission.

## Current capability status

`dealerAdmission` remains `blocked` for product traffic. M4 is partially implemented, not complete. It can become live only when both conditions hold:

1. ClawPump provides a hard per-agent or per-request tool boundary that excludes wallet, transfer, swap, launch, perps, x402, social, automation, self-learning, and agent-management actions.
2. Held-out live runs consistently satisfy the complete strict schema, confidence policy, exact identity binding, timestamp rules, and deterministic acceptance gate.

Until then, KOVA may show a read-only Dealer demo as rejected/insufficient evidence, but cannot accept a pick or open a funded table from that output.

Primary references: [ClawPump Partner API](https://clawpump.tech/developers), [ClawPump MCP documentation](https://clawpump.tech/docs), [Solana RPC account structures](https://solana.com/docs/rpc/json-structures), and [DEX Screener API reference](https://docs.dexscreener.com/api/reference).

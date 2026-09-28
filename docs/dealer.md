# KOVA Dealer

The Dealer decides whether an exact Solana mint may enter a Prediction table. It returns `ACCEPTED`, `REJECTED` or `INSUFFICIENT_EVIDENCE` with reasons. It does not pick for a player, price a round, choose a winner, sign, trade, post or move funds.

It runs as a private ClawPump agent ("KOVA Dealer Sandbox") called through the ClawPump partner API.

## One admission

1. KOVA resolves what the player typed (ticker or address) to one mint and its deepest DEX Screener pair ([`pick-lookup.ts`](../src/adapters/game/pick-lookup.ts)).
2. KOVA reads the mint account from mainnet RPC at `finalized` commitment and collects up to three exact-mint pairs.
3. It sends that evidence to the agent with an exact JSON template, a confidence ceiling, and an instruction to call no tools ([`admission.ts`](../src/application/game/admission.ts)).
4. KOVA replaces whatever the model says about token identity with its own chain read, then validates the rest against the strict `kova-admission-v1` schema.
5. A deterministic gate decides. An `ACCEPTED` answer passes only with an authoritative mint read, two independent source classes, a public URL, no conflicts and confidence under the evidence ceiling. Malformed output is rejected, never repaired.
6. The decision is cached per mint for six hours, so the lock reuses the check the player just saw.

The admission key co-signs a player's deposit only after steps 1 to 5 accept that pick.

## Settings

| Variable | Value | Why |
| --- | --- | --- |
| `KOVA_DEALER_MODEL` | `openai/gpt-5.4-mini` | ClawPump ends an agent turn at about 60 s. With the agent's stored `moonshotai/kimi-k2.5`, every admission request returned HTTP 500 at about 61 s. |
| `KOVA_DEALER_TOOL_BUDGET` | `0` | The Dealer judges only KOVA's evidence. No tool calls also means no transfer or posting skill is ever exercised. |

Measured on 2026-09-27: GME `8wXtPeU6557ETkp9WHFY1n1EcU6NxDvbAggHGsMYiHsB` was accepted at 0.75 in about 12 s; Wrapped SOL was rejected at 0.75 in about 8 s. Both used no tools and cost $0.

Pre-checks are capped at 400 per day across all players.

## Isolation

ClawPump has no per-agent or per-request tool allowlist, and some skills (Private Transfers, Bitget Intel and built-ins such as self-learning) are always on. KOVA's controls:

- the request tells the agent to use no tools;
- any run that reports a tool outside a read-only allowlist is voided;
- the agent's own wallet holds nothing, so a manipulated turn has nothing to move;
- the Dealer never holds or sees a signing key; the admission key stays on the API server.

These are KOVA-side controls. Hard isolation inside ClawPump remains a mainnet gate ([release-status.md](release-status.md)).

## Tools

```bash
CLAWPUMP_API_KEY=... KOVA_DEALER_AGENT_ID=... KOVA_DEALER_MODEL=openai/gpt-5.4-mini KOVA_DEALER_TOOL_BUDGET=0 \
  npx tsx scripts/devnet/probe-dealer.ts <mint> [<mint> ...]
```

The probe prints each decision, reasons, tools used, cost and latency. It never prints the API key.

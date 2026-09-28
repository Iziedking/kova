# KOVA on devnet

Devnet runs the full game with a valueless TEST ANSEM token. Nothing here touches mainnet funds.

## Deployed

| Item | Value |
| --- | --- |
| Program | `AJeX3fo46PTu6StNorvkSatRwXLKAvfZpDv6PAzJVCjj` (upgradeable; authority `5TgAjSx7AKg3GDStjBx1vE7D4CTt6PFdt19YCrgRh2LM`, a separate key that is never mounted into the API) |
| Program bytes | 306,288 bytes, sha256 `0b9e8450a72ba498cbb2ab183fb85c878863ff2d70dfa793d09d496626be1f7d`, built with Anchor 1.2.0 and Solana 4.1.2 |
| TEST ANSEM | `9URYxr92ouua9h1vwWdFetUwrQj4WVcGyRcbSmVN14nA`: Token-2022, 6 decimals, no mint or freeze authority, fixed 1,000,000 supply |

## Keys

The operator (creates, locks and voids tables), oracle (records prices and settles) and admission (co-signs deposits after the Dealer accepts) keys are 0600 files in a private directory outside the repository. None of them ever holds player stakes. Players sign their own deposits and claims.

## How the round runs

1. The host creates a table. It stays an off-chain lobby (24 hours) until the first admitted player asks for a deposit; that request initializes it on chain, and the program then allows 10 minutes for every seat to stake. `POST /api/game/tables/:id/open` lets the host open it early.
2. Each player proves their wallet and submits a private pick with its DEX pair. The backend checks that the pair trades that exact mint, then asks the Dealer.
3. `POST /join` returns a deposit transaction co-signed by the admission key, but only for an accepted pick bound to the stored commitment. The player's wallet signs and submits it, then calls `POST /join/confirm`. Funding is recorded only after the entry account is read back from chain.
4. When the table is full, the worker locks it, captures every pick's DEX Screener mark at the same time, records the starts and activates within the program's 120 second window.
5. After the round, the worker captures again, records results and finalizes. The program checks the start digest, roster order and pot conservation itself. Picks are published only at this showdown.
6. `POST /claim` returns a payout or refund transaction for the player's wallet. A losing entry has nothing to claim.

If the backend dies at any point, the program's deadlines make the table refundable, and anyone can trigger the void.

## Reproduce

These are run on the Linux host with the devnet secrets directory set:

```text
KOVA_DEVNET_SECRETS_DIR=<secrets> npx tsx scripts/devnet/setup-devnet.ts   # keys and TEST ANSEM, idempotent
KOVA_DEVNET_SECRETS_DIR=<secrets> npx tsx scripts/devnet/smoke-devnet.ts   # program client: settle + timeout refund
KOVA_DEVNET_SECRETS_DIR=<secrets> npx tsx scripts/devnet/api-devnet.ts     # full HTTP loop with worker (needs Docker)
CLAWPUMP_API_KEY=... KOVA_DEALER_AGENT_ID=... npx tsx scripts/devnet/probe-dealer.ts <mint>
```

Without ClawPump credentials, `api-devnet.ts` uses a scripted TEST Dealer and says so in its output. That proves the money path, not the Dealer's judgement.

## Dealer settings (live ClawPump, 2026-09-27)

ClawPump ends an agent turn at about 60 seconds. With the agent's stored model (`moonshotai/kimi-k2.5`), every KOVA admission request returned HTTP 500 at about 61 s, with or without tools. A one-line health check on the same agent answered in 3 s.

The working configuration is `KOVA_DEALER_MODEL=openai/gpt-5.4-mini` and `KOVA_DEALER_TOOL_BUDGET=0`. The Dealer judges only the evidence KOVA supplies (the finalized mint read plus up to three exact-mint DEX pairs) and calls no agent tools. The request carries the exact JSON template. Measured results:

| Token | Decision | Latency | Tools | Cost |
| --- | --- | --- | --- | --- |
| GME `8wXtPeU6557ETkp9WHFY1n1EcU6NxDvbAggHGsMYiHsB` | ACCEPTED, 0.73 to 0.75 | about 12 s | none | $0 |
| Wrapped SOL | REJECTED, 0.75 | about 8 s | none | $0 |

`api-devnet.ts` then completed a full devnet game with the real Dealer admitting both picks.

The agent still has transfer, self-learning and skill-management skills enabled on ClawPump. With a tool budget of 0 and the backend voiding any run that reports a non-allowlisted tool, those skills are not exercised, but they should be removed from the Dealer agent.

## Known limits

- Prices are DEX Screener observed marks with no source timestamp. This is not a manipulation-resistant oracle.
- The start is captured just after lock rather than at a pre-announced instant.
- The program accepts any compliant stake mint chosen by the table creator. The backend always uses its configured mint; the mainnet build should pin ANSEM in the program.
- `claim_payout` accepts a zero-award claim. It moves nothing, and the API does not offer it.

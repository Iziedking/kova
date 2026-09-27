# KOVA on devnet

Devnet runs the full game with a valueless TEST ANSEM token. Nothing here touches mainnet funds.

## Deployed

| Item | Value |
| --- | --- |
| Program | `AJeX3fo46PTu6StNorvkSatRwXLKAvfZpDv6PAzJVCjj` (upgradeable; authority is the devnet operator key) |
| Program bytes | 306,288 bytes, sha256 `0b9e8450a72ba498cbb2ab183fb85c878863ff2d70dfa793d09d496626be1f7d`, built with Anchor 1.2.0 and Solana 4.1.2 |
| TEST ANSEM | `9URYxr92ouua9h1vwWdFetUwrQj4WVcGyRcbSmVN14nA`: Token-2022, 6 decimals, no mint or freeze authority, fixed 1,000,000 supply |

## Keys

The operator (creates, locks and voids tables), oracle (records prices and settles) and admission (co-signs deposits after the Dealer accepts) keys are 0600 files in a private directory outside the repository. None of them ever holds player stakes. Players sign their own deposits and claims.

## How the round runs

1. The host creates a table, then `POST /api/game/tables/:id/open` initializes it on chain. The program allows 10 minutes to fill it.
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

## Known limits

- Prices are DEX Screener observed marks with no source timestamp. This is not a manipulation-resistant oracle.
- The start is captured just after lock rather than at a pre-announced instant.
- The program accepts any compliant stake mint chosen by the table creator. The backend always uses its configured mint; the mainnet build should pin ANSEM in the program.
- `claim_payout` accepts a zero-award claim. It moves nothing, and the API does not offer it.

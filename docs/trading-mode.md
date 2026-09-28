# KOVA Trade mode

In Trade mode every player stakes the same ANSEM, gets the same $10,000 match balance, and trades ClawPump tokens for the length of the round. The best portfolio return takes the pot.

## How it runs on devnet

- **Prices are live.** Each quote and fill reads the deepest Solana pair on DEX Screener for that token, at most 4 seconds old.
- **Fills are simulated.** No swap is sent. A fill costs a 0.30% fee, like a pump.fun or DEX swap, and is refused if the price moved more than 2% against the player between quote and fill.
- **Stakes and payouts are real.** Trade tables use the same escrow program as Predict: players sign their own deposit, and the winner claims from escrow with their own wallet.
- **Scoring uses the program's own math.** Every trader starts at a portfolio index of 1.0. At the end the worker marks every position at one shared set of live prices and records equity ÷ starting cash as the end value. The program computes each return and splits the pot exactly as it does for picks. A held token with no live price at the end is valued at zero for everyone alike.

The server is the only place a fill is priced or recorded. The browser sends intent (token, side, dollar amount) and shows what the server returns.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/game/tables/:id/trading/enter` | Take a seat with a proven wallet. No Dealer pick; the seat is admitted directly |
| `GET` | `/api/game/tables/:id/trading` | Balance, positions at live marks, your fills, live standings, tradable tokens |
| `POST` | `/api/game/trading/quotes` | `{ tableId, mint, side, inputUsd }` → a 20-second quote at the live price |
| `POST` | `/api/game/trading/quotes/:id/execute` | Fill at the live price. Idempotent: executing twice returns the same fill |
| `GET` | `/api/game/trading/trades/:id` | One of your fills |

Staking uses the normal `/join` and `/join/confirm` routes.

## Code

- `src/domain/trading/sim.ts`: fixed-point math (18-decimal prices, micro-USD cash), fee, slippage guard, portfolio index.
- `src/domain/trading/ledger.ts`: the cash and position ledger every fill goes through.
- `src/backend/game/trading-sim.ts`: seats, quotes, fills (one row lock per balance), match state and settlement equities.
- `src/backend/db/migrations/0007_kova_trading_sim.sql`: quotes, fill prices and the `simulated` fill source.
- `scripts/test-postgres-trading.ts` (`npm run test:postgres-trading`): the whole flow against a real PostgreSQL, including a price-moved refusal and a concurrent overspend.

## Real swaps (after mainnet)

`src/adapters/game/clawpump-trading.ts` holds the ClawPump quote and unsigned-transaction calls for player-signed swaps. They stay unwired until mainnet: each fill would then be a real swap from the player's wallet, reconciled on chain before it counts.

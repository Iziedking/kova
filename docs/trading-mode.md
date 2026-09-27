# KOVA Trading Mode

Trading Mode extends KOVA's existing prediction table with a second, player-directed competition mode. The prediction mode remains unchanged: players submit private picks and the Dealer settles the result from the configured market window. Trading Mode is reserved for real, user-authorized Solana execution and is not enabled by this repository's preview build.

## Implemented safe slice

- Isolated ledger state is keyed by `competitionId`, `playerId`, and `accountId`.
- Each ledger starts from a fixed competition cash snapshot. Deposits and withdrawals are not ledger operations.
- Buy and sell fills use integer raw quantities and integer micro-USD accounting.
- The ledger rejects overspending, overselling, changed asset decimals, duplicate fill IDs, and duplicate transaction signatures.
- Equity snapshots report cash, marked positions, realized PnL, unrealized PnL, total PnL, and signed PnL basis points.
- Reconciliation accepts a fill only after a confirmed receipt matches the expected signature and isolated wallet.
- Multiple players may trade the same mint because every player has an isolated ledger.
- `GET /api/game/trading/capabilities` exposes the current local-only and blocked capabilities.

## ClawPump boundary

`src/adapters/game/clawpump-trading.ts` implements only the documented partner API quote and unsigned-transaction preparation calls. It uses the apex host, sends the documented snake_case swap fields, and never broadcasts a transaction. The API key is server-only. Do not use the chat endpoint for trade execution: the documented chat loop can invoke side-effecting tools.

The adapter is intentionally not wired into a live route. Before that gate can open, KOVA needs a validated per-player wallet model, an explicit user-authorized signing flow, a controlled trade proof, and onchain reconciliation.

## Required live gates

1. Confirm whether a ClawPump agent wallet can be dedicated to one player and one competition without shared custody or cross-player reuse.
2. Execute one owner-approved controlled trade through the approved signing path and preserve the unsigned transaction, signature, and provider request ID.
3. Reconcile the resulting wallet and transaction against an authoritative Helius or finalized Solana read.
4. Verify buy, sell, fees, and mark-to-market PnL from observed fills rather than provider text.
5. Prove ANSEM stake and payout isolation separately from trading capital.
6. Prove a same-token two-player duel with separate ledgers and deterministic winner selection.

No live trading, ANSEM escrow, payout, automated strategy, or shared wallet is authorized by this safe slice.

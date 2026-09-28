# KOVA game API

The HTTP API the frontend and any other client use. Public reads need no credentials. Game writes need a Privy bearer token, a Solana wallet proven with a signed challenge, and, for anything that moves tokens, the player's own wallet signature. The API never holds or moves player funds itself: it returns transactions for the player's wallet to sign.

## Product boundary

KOVA is a secret-pick multiplayer price-performance game for Solana stock-themed meme tokens. Every player stakes the same raw amount. Before a round starts, the Dealer must classify each exact submitted mint. During the round, prices and picks stay private. Deterministic code, never the model, calculates signed basis-point performance, identifies ties, and allocates the pot.

The Dealer is economically necessary because arbitrary mints cannot enter a table without evidence-backed admission. It may classify identity and narrative evidence. It may not select a token for a player, price a token, score a round, choose a winner, move funds, post socially, or automate a financial action.

## Values and arithmetic

Money and price fields are strings:

- `RawAmount`: canonical unsigned integer base units, bounded by `u64` where it enters pot accounting.
- `Price18`: canonical unsigned integer scaled by `10^18`, bounded at `10^24`.
- `SignedBps`: canonical signed integer basis points.

The score is `((endPrice18 - startPrice18) * 10000) / startPrice18`. Integer division truncates toward zero. `startPrice18` must be greater than zero. A zero end mark is valid. Scientific notation, negative prices, unsupported precision, oversized values, and floating-point arithmetic are rejected.

The pot is `stakeRaw * fundedPlayerCount`, checked against `u64`. Tied winners receive the quotient, then remainder units in ascending decoded wallet-byte order. Base58 text order and request order are not tie breakers.

## Commitments

`pickCommitment` is SHA-256 over exactly:

```text
UTF8("KOVA_PICK_V1") || uuid16 || wallet32 || mint32 || salt32
```

`sealedMarketHash` is SHA-256 over exactly:

```text
UTF8("KOVA_MARKET_V1") || uuid16 || wallet32 || mint32 || pairMint32 || salt32 || rulesHash32
```

There are no JSON objects, delimiters, ticker normalization rules, or locale-dependent strings in either payload. Browser clients must generate the 32-byte salt with a cryptographically secure random source.

The v1 interoperability vectors are:

```json
{
  "tableId": "018f7f5e-7b1a-4d40-8a41-8dd5f8108f02",
  "wallet": "11111111111111111111111111111111",
  "mint": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "pairMint": "So11111111111111111111111111111111111111112",
  "saltHex": "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  "rulesHashHex": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  "pickCommitment": "08a068f87b3ecba7716b36d8b1f1991f85c32815cc5c64c33d54a5df618c2e97",
  "sealedMarketHash": "a6dfd8667fc06c64b773c5c7c997189a12b9fc08874439d2aa2b7f503416e93d"
}
```

## State and time

Game states are `DRAFT`, `OPEN`, `LOCKING`, `ACTIVE`, `SETTLING`, `SETTLED`, `CANCELLED`, and `VOIDED`. Financial state is separate. The program enforces a ten-minute maximum open window, a two-minute activation window and a five-minute settlement window. The round length is set per deployment, from 60 to 900 seconds (`KOVA_ROUND_SECONDS`), and each table's `rules.roundDurationSeconds` states it.

All transitions receive an explicit clock. At the exact settlement deadline, finalization is disallowed and timeout-to-refund is allowed. A funded player cannot be removed because their pick lost. If a funded player has an invalid admission at activation, the whole table cancels into refunds instead of quietly excluding that player.

## HTTP surface

| Method | Route | Behavior |
| --- | --- | --- |
| `GET` | `/api/game/capabilities` | Capability states and network mode (`preview`, `devnet`, `limited_live`) |
| `GET` | `/api/game/tables` | Public tables in the `PublicTable` shape |
| `GET` | `/api/game/markets` | Public market list: ClawPump's token feed with DEX Screener price, 24h change and liquidity. `sort` = `trending`, `new`, `volume`, `movers`, `liquidity`; `q` searches; `limit` ≤ 60. Cached 30 s |
| `GET` | `/api/game/markets/:mint` | One token from the same sources, or `404` |
| `POST` | `/api/game/faucet` | Devnet only: 10 TEST ANSEM and 0.02 SOL to a wallet this account has proven, once per wallet and account per day |
| `GET` | `/api/game/tables/:id` | One table. With a bearer token it also returns `viewer`: whether you host it and your own seat |
| `POST` | `/api/game/auth/wallet/challenges` | Origin-bound ownership message; never a transaction authorization |
| `POST` | `/api/game/auth/wallet/proofs` | Verifies and consumes one Solana signature challenge |
| `POST` | `/api/game/tables` | Creates a table and, with escrow configured, opens it on chain |
| `POST` | `/api/game/tables/:id/invitations` | Host-only private invitation |
| `POST` | `/api/game/invitations/claim` | One-account atomic invitation claim |
| `POST` | `/api/game/dealer/check` | Resolves a ticker or mint and returns the Dealer's decision and reasons. Commits nothing |
| `POST` | `/api/game/tables/:id/submissions` | Stores the encrypted pick and its commitments, then runs Dealer admission |
| `GET` | `/api/game/tables/:id/private` | Your own private projection, including your pick |
| `POST` | `/api/game/tables/:id/join` | Deposit transaction co-signed by the admission key, only for an accepted pick. Your wallet signs and sends it |
| `POST` | `/api/game/tables/:id/join/confirm` | Records your seat as funded after reading the entry back from chain |
| `POST` | `/api/game/tables/:id/claim` | Payout (settled) or refund (cancelled or voided) transaction for your wallet. A losing entry gets `NOTHING_TO_CLAIM` |
| `GET` | `/api/game/tables/:id/result` | Showdown standings and revealed picks, after settlement |
| `GET` | `/api/game/tables/:id/events` | SSE replay from `Last-Event-ID` or `after` |
| `POST` | `/api/game/tables/:id/open` | Opens a created table on chain if it is not open yet (host only) |
| `POST` | `/api/game/tables/:id/reveal`, `/settle` | Always `409`: the worker reveals and settles |

Before showdown, a public table omits submitted picks and mints, pair identity, narrative/evidence, commitments, price marks, scores, and winner hints. The stake mint and public rules remain visible.

## Storage and failure

Migrations are checksummed and append-only. Wallet binding, invitations, idempotency and budget reservations are atomic. Private picks are AES-256-GCM records with key identifiers for rotation. The API refuses to boot in game mode if its database, Privy credentials, stake mint or encryption key is missing, and a database error is never replaced by in-memory state.

Error responses use `{ ok: false, code, message, retryable }`. Codes include `ADMISSION_NOT_ACCEPTED`, `TABLE_NOT_OPEN`, `ENTRY_NOT_FUNDED`, `ENTRY_COMMITMENT_MISMATCH`, `NOTHING_TO_CLAIM`, `PICK_NOT_FOUND`, `DEALER_UNAVAILABLE` and `DEALER_BUDGET_EXHAUSTED`.

`npm run test:postgres-game` runs the real-PostgreSQL race and migration tests, `npm run prove:game` the keyless contract proof, and `scripts/devnet/api-devnet.ts` a full game through these routes on devnet.

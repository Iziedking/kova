# KOVA game API

This document describes the M3 API surface. Public preview reads still work without credentials. When durable game mode is explicitly enabled, private non-financial admission routes use PostgreSQL, Privy bearer verification, a separately signed Solana wallet challenge, and encrypted pick storage. Escrow, settlement, payout, and refund behavior remain local-validator-only; no HTTP route moves value.

## Product boundary

KOVA is a secret-pick multiplayer price-performance game for Solana stock-themed meme tokens. Every player stakes the same raw amount. Before a round starts, the Dealer must classify each exact submitted mint. During the round, prices and picks stay private. The deterministic rules engine—not the model—calculates signed basis-point performance, identifies ties, and allocates the pot.

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

Game states are `DRAFT`, `OPEN`, `LOCKING`, `ACTIVE`, `SETTLING`, `SETTLED`, `CANCELLED`, and `VOIDED`. Financial state is separate. The default limits are a ten-minute maximum open window, two-minute activation window, 900-second round, and five-minute settlement window.

All transitions receive an explicit clock. At the exact settlement deadline, finalization is disallowed and timeout-to-refund is allowed. A funded player cannot be removed because their pick lost. If a funded player has an invalid admission at activation, the whole table cancels into refunds instead of quietly excluding that player.

## HTTP surface

| Method | Route | M3 behavior |
| --- | --- | --- |
| `GET` | `/api/game/capabilities` | Exact capability states |
| `GET` | `/api/game/tables` | Public fixture list in preview; public PostgreSQL tables when M3 is enabled |
| `GET` | `/api/game/tables/:id` | Public table, or a private table visible to its host/participant |
| `POST` | `/api/game/auth/wallet/challenges` | Authenticated, origin-bound ownership message; never a transaction authorization |
| `POST` | `/api/game/auth/wallet/proofs` | Verifies and consumes one Solana signature challenge |
| `POST` | `/api/game/tables` | Creates an unfunded draft; cannot open escrow |
| `POST` | `/api/game/tables/:id/invitations` | Host-only private invitation creation |
| `POST` | `/api/game/invitations/claim` | One-account atomic invitation claim |
| `POST` | `/api/game/tables/:id/submissions` | Creates commitments and stores the secret encrypted with admission pending |
| `GET` | `/api/game/tables/:id/private` | Returns only the authenticated participant's own private projection |
| `GET` | `/api/game/tables/:id/events` | SSE replay from `Last-Event-ID` or `after`; public events plus the authenticated principal's own events |
| `POST` | `/api/game/tables/:id/join` | Refuses |
| `POST` | `/api/game/tables/:id/reveal` | Refuses |
| `POST` | `/api/game/tables/:id/settle` | Refuses |

Before showdown, a public table omits submitted picks and mints, pair identity, narrative/evidence, commitments, price marks, scores, and winner hints. The stake mint and public rules remain visible.

## Capability truth

M3 adds checksummed append-only migrations, a real PostgreSQL repository, atomic wallet/invitation/idempotency/budget operations, and AES-256-GCM private records with key identifiers for rotation. A configured durable game fails at boot if its database, Privy server credentials, ANSEM mint identity or active encryption key is absent. A database error is never replaced by memory state.

Dealer admission is still blocked pending M4's constrained adapter and real receipt. New submissions therefore remain `INSUFFICIENT_EVIDENCE` and unfunded. Program escrow, settlement, payout, and refunds remain `local_validator_only`, never live. Run `npm run test:postgres-game` for the disposable real-Postgres concurrency/upgrade proof, `npm run prove:game` for the keyless contract proof, and `npm run test:program-client` for the isolated validator proof.

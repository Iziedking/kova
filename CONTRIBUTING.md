# Contributing to KOVA

KOVA is an agent-gated, secret-pick multiplayer game for Solana stock-themed meme tokens. Read this contract before changing the repository. The owner provides the detailed build plan separately; private plans, prompts, research, credentials, wallet details, and generated evidence do not belong in Git.

## Current boundary

M2 local program proof is implemented. Pure TypeScript covers integer scoring, checked pot math, deterministic byte-order tie allocation, commitments, state transitions, public/private schemas, and fail-closed game API fixtures. The pinned Anchor program adds local Token-2022 escrow, payouts, replay refusal, and timeout refunds. See [`docs/game-api.md`](docs/game-api.md) and [`docs/program.md`](docs/program.md).

The following are not live or proven:

- hard-isolated Dealer execution and signed admission receipts;
- private pick storage, reveal, replay protection, or authenticated sessions;
- canonical ANSEM mint identity or approved-network funded escrow;
- trusted exact-time start/end price marks;
- devnet/mainnet program deployment or value-bearing settlement;
- production database migration, VM deployment, or legal availability.

The repository still contains the previous liquidity-marketplace read and evidence modules. Treat them as legacy inputs, not the current product model. Do not delete or silently rebrand them in an unrelated contribution.

## Ownership and collision boundaries

The owner controls Git history, deployments, credentials, wallets, provider spend, and value-bearing releases. Contributors create their own branch and open a pull request; they do not push to or rewrite `main`.

Benita owns product-interface work. Coordinate before changing `src/app`, `src/components`, `src/design`, or `src/auth`. Backend contributors should work in `src/domain/game`, `src/backend/game`, persistence, workers, program code, tests, and public API documentation unless assigned otherwise.

## Non-negotiable boundaries

Do not:

- add secrets, private keys, seed phrases, provider keys, RPC URLs, or database credentials to source, fixtures, logs, screenshots, or pull requests;
- let an LLM pick a player's token, provide a price mark, score a round, select a winner, construct a payout, or control funds;
- use ticker-only token identity; Dealer research starts from the exact mint;
- disclose a private pick, submitted mint, market pair, narrative, evidence, commitment, marks, score, or winner hint before showdown;
- use floating point for token amounts, prices, scores, pots, or payouts;
- silently drop a funded player, reinterpret a deadline, or mutate a sealed rule version;
- enable signing, escrow, payout, provider spend, migrations, or deployment by changing a default;
- claim a fixture, simulation, or configured capability is live.

The Dealer may classify and explain evidence. It may not invoke financial, wallet, social-posting, or automation capabilities. `INSUFFICIENT_EVIDENCE` is a valid result and must not be coerced into acceptance.

## Engineering rules

- Keep game rules pure and deterministic; pass time and external reads in.
- Use canonical integer strings and checked `bigint` arithmetic.
- Validate every boundary with the shared Zod schemas.
- Preserve explicit `unavailable`, `blocked`, `unknown`, and `preview_only` states.
- Add adversarial tests for privacy, stale data, replay, authority, deadline, rounding, overflow, and refusal behavior.
- Keep provider integrations behind ports/adapters.
- A capability only changes state when evidence proves the new state.
- Read the installed Next.js documentation under `node_modules/next/dist/docs` before changing framework code; this repository uses Next.js 16.

## Start a contribution

```bash
git fetch origin
git status --short --branch
git switch -c feat/short-description
npm ci
```

If the working tree is dirty, stop and coordinate. Do not reset, stash, discard, or overwrite someone else's work.

Keep one milestone-sized concern per pull request. A useful next sequence is:

1. Durable PostgreSQL table/participant/commit/mark/result/event schema.
2. Authenticated private APIs with encrypted secret storage and replay guards.
3. Dealer adapter with exact-mint research receipts and hard capability limits.
4. Price-mark worker with provider timestamps/slots and durable retries.
5. Frontend integration against the stable API contract.
6. Security review, preview deployment, then separately approved value-bearing release gates.

## Required checks

```bash
npm run typecheck
npm run lint
npm test
npm run prove
npm run test:program-client # with the isolated local validator already running
npx next build --webpack
npm run check:client-bundle
git diff --check
```

Run relevant Playwright tests when a browser flow changes. Never report a skipped command as passed. If Windows blocks child processes with `spawn EPERM`, rerun the exact command in a permitted shell and record both outcomes.

## Pull requests

A pull request must state:

- the outcome and plan milestone addressed;
- exact files and boundaries changed;
- commands run and results;
- whether capability, privacy, custody, signing, capital, deployment, or secrets changed;
- known limitations and the next owner gate.

Definition of done: the change is focused, tests and proofs pass, money and authority paths fail closed, public claims match evidence, no internal or secret material is included, and the owner can review the diff before merge. Generated build directories stay ignored; the reviewed `idl/` interface is the deliberate exception.

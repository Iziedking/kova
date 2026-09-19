# KOVA

KOVA is an agent-gated multiplayer game for Solana stock-themed meme tokens. Players privately submit their own token picks, stake equal amounts of ANSEM, and compete on deterministic price performance. The KOVA Dealer investigates each exact mint and decides whether it is eligible to enter; it never picks a token, determines a price, chooses a winner, or controls funds.

## Current status

The repository has completed the safe local M1-M3 foundation, with partial M4-M7 integration behind explicit release gates. These pieces execute locally without financial-provider credentials:

- exact integer amount, price, score, pot, and tie-allocation rules;
- byte-canonical SHA-256 commitment payloads with fixed test vectors;
- an explicit table and financial state machine with deadline/refund rules;
- typed public/private API schemas and a public fixture responder;
- fail-closed HTTP routes for every unavailable game mutation;
- keyless proof output through `npm run prove:game`.
- a pinned Anchor 1.2.0 / Solana 4.1.2 escrow program and reviewed IDL;
- real local-validator Token-2022 deposits, deterministic payout, replay refusal, and permissionless timeout refunds;
- measured two-player transactions no larger than 570 bytes or 21,221 simulated compute units.
- checksummed append-only PostgreSQL migrations that preserve the earlier evidence schema;
- VM-side Privy bearer verification plus a replay-safe Solana wallet ownership challenge;
- private invitation, participant, idempotency, and budget-reservation state with serialized races;
- AES-256-GCM private pick records with authenticated context, tamper detection, and versioned key rotation.
- strict exact-mint Dealer validation, read-only evidence adapters and an encrypted provider cache; production Dealer admission remains blocked because ClawPump cannot yet enforce a hard tool allowlist;
- leased lifecycle jobs, immutable capture plans/samples, deterministic result manifests, replayable scoped events and a model-independent signer validator; no signer or relay is present;
- separate liveness/readiness/capability checks, bounded shutdown, pinned CI/container dependencies, hardened VM runtime and a content-addressed release manifest.

This is not yet a live value-bearing game. Real Dealer isolation, exact-time production settlement marks, canonical ANSEM identity, approved network deployment, independent program review, signer isolation, backup/restore rehearsal, and legal availability are not proven. Durable game mode remains disabled by default. The program evidence is local only. The older liquidity-marketplace endpoints remain in the repository as legacy evidence work and must not be described as the current KOVA product.

The public protocol contract is documented in [`docs/game-api.md`](docs/game-api.md). Program invariants and reproduction steps are in [`docs/program.md`](docs/program.md).
The implemented Dealer adapters, strict gate, and current ClawPump isolation blocker are documented in [`docs/dealer.md`](docs/dealer.md).
The leased worker, capture, manifest, event-stream, and chain-intent boundaries are documented in [`docs/worker.md`](docs/worker.md).
The current release gates are explicit in [`docs/release-status.md`](docs/release-status.md), and the owner-only hackathon/token workflow is prepared in [`docs/tokenization.md`](docs/tokenization.md).

## Why the agent matters

KOVA accepts arbitrary Solana mints. A table cannot safely admit a symbol or a marketing claim at face value. The Dealer must research the exact mint, establish whether it is a stock-themed meme, preserve evidence and conflicts, and return `ACCEPTED`, `REJECTED`, or `INSUFFICIENT_EVIDENCE`. Without that classification step, a submitted market cannot enter the game.

The deterministic system retains every financial authority: it validates commitments, records marks, calculates signed basis-point returns, resolves ties, and enforces payouts/refunds. This separation keeps the agent essential without allowing model output to decide money movement.

## Development

Use Node.js 24 LTS and the exact lockfile.

```text
npm ci
npm run dev
npm run backend:dev
npm run db:migrate
npm run test:game
npm run test:postgres-game
npm run prove:game
npm run prove:release
npm run check
npm run check:node24 # isolated pinned release-runtime gate
```

Program work additionally requires the pinned Linux/WSL toolchain. Build and local-validator instructions are in [`docs/program.md`](docs/program.md). `npm run test:program-client` intentionally fails unless that isolated validator is already running with the compiled program.

The backend defaults to `http://127.0.0.1:8787`. No credential is required for the preview API. Durable M3 routes are enabled only with `KOVA_GAME_ENABLED=true` and the complete server-only database, Privy, mint, and encryption configuration from `.env.example`.

```text
GET /api/game/capabilities
GET /api/game/tables
GET /api/game/tables/018f7f5e-7b1a-4d40-8a41-8dd5f8108f02
```

Financial game routes still return a typed `503` refusal. M3 exposes only non-financial table, invitation, wallet-proof, and encrypted-submission writes. Never expose RPC, database, Privy, ClawPump, encryption, or wallet secrets to the browser.

The complete check runs typecheck, lint, all tests, both proof scripts, a production build, and the client-bundle secret scan. If the host blocks Node test workers with `spawn EPERM`, rerun the same command in a permitted local shell and record that limitation.

## Structure

- `src/domain/game`: pure KOVA values, scoring, commitments, schemas, and state
- `src/backend/game`: preview fixtures, durable repository, authentication, encryption, and scoped HTTP routes
- `src/backend/workers`: leased jobs, immutable orchestration records, replayable scoped events
- `src/backend/signer`: model-independent result-manifest validator; no signing key is present
- `tests/game`: adversarial rule, privacy, deadline, and API tests
- `scripts/prove-game.ts`: keyless executable product proof
- `programs/kova_game`: bounded Anchor escrow and recovery program
- `idl`: reviewed generated program interface and client type
- `scripts/test-program-local.ts`: real local-validator balance/replay/refund proof
- `docs/game-api.md`: public protocol and API contract
- `src/domain`, `src/backend`, `src/adapters`: legacy evidence/read work retained
- `CONTRIBUTING.md`: contributor and pull-request contract

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before changing the repository. Work arrives through focused branches and pull requests; the owner reviews and merges. Do not commit internal plans, credentials, generated artifacts, or wallet material.

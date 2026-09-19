# KOVA release status

Last reviewed 2026-09-19. This document is the public capability boundary; it does not authorize deployment or value-bearing play.

## Implemented and locally verified

- M1 deterministic amount, commitment, scoring, tie, state and API contracts.
- M2 Anchor Token-2022 escrow with local-validator deposit, payout, replay-refusal and timeout-refund proof.
- M3 checksummed PostgreSQL migrations, Privy bearer boundary, exact Solana wallet proof, encrypted private picks, invitations, idempotency and budget races.
- M4 exact-mint read-only evidence adapters, strict tri-state Dealer schema/gate and encrypted provider cache.
- M5 leased jobs, immutable capture records, frozen result manifests, chain-operation reconciliation and signer-side deterministic validation.
- M6 replayable scoped SSE events and server-time projections. The current consumer interface is not the final game loop; Benita owns that integration.
- M7 liveness/readiness/capability separation, body/CORS/security-header boundaries, bounded shutdown, immutable CI/container pins, private runbook and source release manifest.

## Intentionally unavailable

- production Dealer admission;
- live ANSEM deposits, settlement, relaying or payouts;
- a production price/capture provider policy;
- signer or program-upgrade authority in the application runtime;
- public value-bearing tables;
- KOVA token launch, X announcement or official entry mutation.

## Blocking evidence

| Gate | Current status | Required closure |
| --- | --- | --- |
| Exact ANSEM identity | Candidate account observed, official identity not established | Organizer/owner source plus finalized selected-network account fixture |
| Dealer isolation | Blocked | ClawPump hard per-agent/request allowlist excluding financial, wallet, social, automation and self-modification tools; schema-valid held-out runs |
| Price policy | Blocked | Owner-reviewed source/timing/fallback/manipulation policy and real captured samples |
| Program release | Local only | Independent review, exact deployed bytecode/program ID, authority map and approved-network rehearsals |
| Legal availability | Blocked | Written jurisdiction, age, dispute and financial-control scope from a qualified reviewer |
| Recovery operations | Partial | Encrypted backup plus isolated restore/decryption/reconciliation timing evidence |
| Dependency posture | Blocked for money mode | Resolve or explicitly disposition current production audit findings; do not force breaking downgrades |
| Complete browser loop | Benita/owner gate | Shared-schema UI integration plus wallet rejection/reconnect/two-user E2E |
| Deployment | Not authorized | Owner-reviewed clean release manifest, VM/Vercel environment and explicit deployment action |

The smallest honest release is a no-value preview. An approved devnet game with clearly labelled test tokens can demonstrate escrow architecture after owner approval, but it is not the requested real-ANSEM product.

## Reproduction

```text
npm ci
npm run check
npm run test:postgres-game
npm run check:node24
npm run prove:release
```

Program reproduction requires the separate pinned Linux/WSL toolchain in [`program.md`](program.md). A clean source manifest and green tests are necessary but not sufficient for live money.

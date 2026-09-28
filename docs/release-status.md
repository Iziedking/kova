# KOVA release status

Last reviewed 2026-09-28.

KOVA plays real on-chain games on Solana devnet with a valueless TEST ANSEM token. Nothing in this repository enables mainnet stakes; that needs the gates at the end of this page.

## Capabilities

| Capability | State | Evidence |
| --- | --- | --- |
| Scoring, commitments, pot and tie rules | Live | Unit and adversarial tests; the program recomputes scores on chain |
| Escrow program | Live on devnet | `AJeX3fo46PTu6StNorvkSatRwXLKAvfZpDv6PAzJVCjj`; deployed bytes match the reviewed build hash (see [devnet.md](devnet.md)) |
| Deposits, settlement, payouts, timeout refunds | Live on devnet | `scripts/devnet/smoke-devnet.ts` and `scripts/devnet/api-devnet.ts` games, 2026-09-27/28 |
| Dealer admission | Live, isolation enforced by KOVA | Real ClawPump runs: GME accepted, Wrapped SOL rejected; see [dealer.md](dealer.md) |
| Private picks | Live | AES-256-GCM records, hidden from other players until showdown |
| Accounts and wallet proof | Live | Privy sessions plus a signed Solana ownership challenge |
| Settlement worker | Live on devnet | Locks, captures, activates and settles without manual steps |
| API and frontend deployment | Live | `api.kova.surf` on the VM, `kova.surf` on Vercel, deployed by CI from `main` |
| Trade mode | Devnet | Live DEX prices, simulated fills, escrowed stakes; real swaps wait for mainnet ([trading-mode.md](trading-mode.md)) |
| Mainnet ANSEM stakes | Not enabled | Gates below |

## Before mainnet

| Gate | What closes it |
| --- | --- |
| Stake mint | Rebuild the program with the ANSEM mint pinned, so a table cannot be opened on a look-alike token. Today the creator chooses the mint and only the backend enforces it. |
| Zero-award claim | Add `require!(award > 0)` to `claim_payout`. Today a loser's claim moves nothing but succeeds. |
| Program review | Independent review of the escrow program and a decision on upgrade authority (multisig or immutable). |
| Price policy | Accept or replace the DEX Screener observed-mark model. Marks carry no source timestamp, and a thin market can be moved during a round. |
| Dealer isolation | ClawPump cannot turn off the agent's always-on transfer and posting skills. KOVA sends no tools and voids any run that reports one; the agent's wallet must stay empty. |
| Stake cap | Enforce a small per-seat cap on mainnet (the program's hard limit is 10 ANSEM). |
| Legal | Written review of jurisdiction, age and prize rules for paid play. |
| Recovery | Encrypted database backup plus a timed restore and reconciliation rehearsal. |

## Reproduce

```bash
npm ci
npm run check
npm run test:postgres-game
```

The program proof needs the pinned toolchain and a local validator ([program.md](program.md)). The devnet proofs need a funded devnet operator key ([devnet.md](devnet.md)).

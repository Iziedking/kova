# Kova v3 on NEAR: design record

Branch `kova-v3`. Source brief: `KOVA_AGENT_BRIEF.md` (overrides the other two plan docs). This file
records what was built, what was verified against official documentation or the chain, and where
the build differs from the brief. Update it when the code changes; do not copy it elsewhere.

The live site (`near.kova.surf`, `kova-chip.testnet`, `near/chip/`) is untouched.

## What is here

| Folder | What | Crate |
| --- | --- | --- |
| `near/mine` | One mine: the 5x5 grid for one NEP-141 coin | `kova-mine` |
| `near/factory` | Opens one mine per accepted coin, by global code hash | `kova-factory` |
| `near/chip-v3` | CHIP: no premine; minted only by mining and the testnet starter claim | `kova-chip-v3` |

Each is its own cargo project (own `Cargo.lock`, pinned to the same crate versions as `near/chip`:
near-sdk 5.30.1, toolchain 1.95.0). `near/factory/tests/sandbox.rs` is the end-to-end test.

## Verified facts (and where they came from)

| Fact | Source |
| --- | --- |
| A global contract referenced **by hash** is immutable; by account id it follows the publisher's updates | docs.near.org/smart-contracts/global-contracts |
| near-sdk 5.30.1 names the by-hash call `Promise::use_global_contract(code_hash)` (not `_by_hash`) | `near-sdk-5.30.1/src/promise.rs:578` |
| Publishing burns about 10 NEAR per 100 KB of wasm; each user pays only a reference | same page |
| A factory can create the account, attach the code and call `init` in one atomic batch; on failure it refunds in a callback | docs.near.org/web3-apps/tutorials/mastering-near/4-factory |
| `random_seed` is the block producer's signature of the previous block hash; a validator can still refuse to include a transaction whose result it dislikes | docs.near.org/smart-contracts/security/random |
| The meme.cooking testnet launchpad is `factory.v10.meme-cooking.testnet`, mainnet `meme-cooking.near` | docs.meme.cooking/other/developers |
| `near-sandbox` 0.4.0 runs nearcore 2.14.0; `near-api` 0.8.7 has `deploy_global_contract_code(..).as_hash()` and `use_global_hash` | crate sources |
| `ft_transfer_call` needs 1 yoctoNEAR, so a function-call key (no deposit) cannot send a coin | NEP-141 as implemented in `near-contract-standards` |

Still UNKNOWN, to be checked on chain before Phase 2 and 5: the account naming of testnet
meme.cooking tokens (so the testnet suffix can be set), whether BRRRAIN is at `token.brrrain.near`,
whether it has `ft_burn`, and whether its transfers are open.

## Rules as built

- **Grid and round.** 25 squares. A round is one UTC minute (`unix_seconds / 60`), timed with
  `env::block_timestamp`. Stake with `ft_transfer_call` to the mine and the message
  `{"square":7}` (optionally `"round":N` to pin the minute; a late transaction is then refunded).
- **Winner.** `settle(round)`, callable by anyone from the end of the round for ten minutes. The
  square is `sha256("kova-mine-v1|<mine>|<round>|<random_seed>")` reduced by rejection sampling, so
  every square has exactly 10 of 250 accepted byte values (no modulo bias).
- **Payout.** Losing stakes: 10% burned (rounded down), the rest shared by stake among the winners
  on the square, who also get their stake back. Everything staked, plus any vein release, is paid
  or burned to the unit (unit-tested over 20,000 random rounds and re-checked in the sandbox).
- **Winners are paid inside `settle`** (first 10 payees). A failed transfer, or more winners than
  one transaction can pay, waits in `claim`. `claim` needs no deposit.
- **Burn.** `ft_burn` on the coin; if the coin has none, `register` and `ft_transfer` to a keyless
  account, `5a8793ba...fa05b` (the implicit account whose "key" is `sha256("kova-burn-v1")`, with
  no contract). If both fail, the amount is held and burned with the next round.
- **Midnight.** A day has exactly 1,440 rounds, so no round crosses 00:00 UTC. The 23:59 round is
  closed to stakes, so a round staked at 23:58 can be settled before midnight. The contract cannot
  force someone to settle: a keeper (the Foreman, or anyone) has to call `settle`.
- **Never settled.** After ten minutes `refund_round` returns every stake in full, nothing burned.
- **Empty winning square.** Every stake is refunded, nothing burned, no emission. (Decision: see
  below.)
- **Vein.** Optional, per mine: coins sent with the message `"vein"` fund it; each round with
  winners releases `vein_per_round >> halvings` to them, halving every `vein_halving_days`.
- **CHIP emission.** 10 CHIP a minute across all mines, halving every 30 days, capped at
  21,000,000 minted in total. Each mine reports its round to CHIP; its share of the minute is its
  players over all players that minute, and goes to that round's winners by stake.
- **Motherlode.** +2 CHIP per settled round with a winner, one jackpot for all mines, capped at
  5,000 CHIP; 1 in 625 chance per round to mint it all to that round's winners.
- **Starter claim.** 1,000 CHIP once per account out of a fixed budget; amount 0 removes the claim
  (mainnet).
- **Who can open a mine.** Anyone, attaching 0.2 NEAR, for CHIP, a fixed list of coins (BRRRAIN on
  mainnet) and any coin that is a **direct child** of a listed suffix (`.meme-cooking.near`).
- **Authority.** None. No owner, setter, pause or upgrade method in any contract; the sandbox test
  compares each contract's exported interface to a fixed list and rejects admin-style names. Mines
  are keyless from birth. CHIP trusts a call from `<name>.<factory>` as a call from mine code.

## Decisions the brief left open (change them in the code if you disagree)

1. **No-popup play works for CHIP only.** The brief says the game key is limited to "the mine's
   deploy method, no deposit". A NEP-141 coin cannot be pulled out of a wallet without that
   wallet's own 1 yoctoNEAR, so a deposit-free key cannot stake an arbitrary coin. CHIP-v3
   therefore has `mine_deploy(mine, square, amount)`, which a game key can call (only to mines).
   Other coins use `ft_transfer_call`, which needs a wallet confirmation per stake. A prepaid
   "bank" inside the mine would lift this, at the cost of leaving coins in a contract at the
   BRRRAIN snapshot. Not built.
2. **An empty winning square refunds the round** rather than rolling the pot forward. It keeps the
   contract small and nobody loses coins to an empty square, but in a quiet mine most rounds
   refund, so little burns. The 60-day simulation should be rerun with this rule (Phase 2).
3. **CHIP's emission split needs a note per new player.** Each mine tells CHIP when a player
   first stakes in a minute (`note_player`), so CHIP knows the minute's total players before any
   mine reports. If a note arrives late, a mine's share is computed on a smaller total, but a
   minute can never release more than its rate (`minute_emitted`), so the cap on a minute holds.
4. **Per-stake and per-round limits are chosen by whoever opens the mine** (`min_stake`,
   `max_stake` per player per round), because the right size depends on the coin's decimals.
   They are fixed for the life of the mine and readable with `get_config`.
5. **Round history is kept short.** Only the last 24 results stay in contract state (the full
   history is in the `EVENT_JSON` logs), because a result per minute would cost about 1.4 NEAR of
   storage a day.

## Known limits (state them in the README; do not hide them)

- A validator or block producer could, in theory, decline to include a `settle` whose square it
  dislikes, or time it. Rounds with a validator stake are not safe from this; keep stake caps
  small on mainnet.
- Someone must call `settle`. If nobody does for ten minutes the round is refunded.
- A mine pays the 1 yocto per transfer and the burn-account registration from its own NEAR. It is
  funded with 0.2 NEAR at opening; anyone can send it more. If a mine runs out of NEAR its
  settles fail and its rounds are refunded after ten minutes.
- If the factory has too little NEAR when a failed opening's callback runs, the refund to the
  opener cannot be sent. Keep a small float on the factory account.
- No audit.

## Phase 1 evidence (2026-11-14)

- `near/mine`: 25 unit tests. `near/chip-v3`: 20. `near/factory`: 8. All pass (`cargo test`).
- `near/factory/tests/sandbox.rs` (nearcore 2.14.0 sandbox, real transactions): the factory opens a
  CHIP mine and a `.meme-cooking.sandbox` coin's mine from a global contract by hash; refuses a coin
  it should not accept, a small deposit, a duplicate, and a second `new`; each mine has zero access
  keys and runs the published hash; three players play 10 rounds in both mines (4 + 6 settled, 6 + 4
  refunded); every round pays out exactly what was staked and burns exactly 10% of the losing
  stakes; mine balances equal what they owe; CHIP supply equals minted less burned; emission within
  10 CHIP a minute; exported interfaces match a fixed list with no admin-style method. 638 s.
- Not covered by the sandbox (covered by unit tests only): a payout that fails and falls to `claim`,
  the burn fallback for a coin without `ft_burn`, the vein, a Motherlode hit, and `refund_round`
  after ten minutes.
- Repo checks on this branch: `npm run lint` clean, `npm run typecheck` clean (after `npm ci`),
  `npm test` 323 pass.

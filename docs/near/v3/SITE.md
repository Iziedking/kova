# Kova v3 site (Phase 3)

Routes under `src/app/near/`, code in `src/features/near/grid/`, chain reads in
`src/adapters/near/grid.ts`. The original poker app is untouched and lives at `/near/classic` (its
other pages keep their paths). Every number on the new pages is read from the contracts; nothing is
typed in. Deployment read: `docs/near/v3/testnet.json`.

| Route | What it shows |
| --- | --- |
| `/near` | Landing (copy from the brief; the BRRRAIN, meme.cooking and Foreman sections are cut until they exist), a live CHIP board and timer, live totals |
| `/near/mines` | Every mine on the factory: this round, players, burned, time to the next result |
| `/near/mines/<coin>` | The 5x5 board, timer, your stakes, last winners, stake panel, settle button, claim, auto-mine (CHIP mine), recent rounds |
| `/near/open` | The coins the factory accepts (read live) and the open-a-mine form (`open_mine`, 0.2 NEAR) |
| `/near/chip` | Supply, minted vs burned, Motherlode, emission and halving, burns per mine, live zero-key proof, starter claim |
| `/near/leaders` | Winners per mine from the last 24 results the contract keeps |

## How playing works

- Sign-in and the email flow are the existing ones (`near-session.tsx`). A second, separate game key
  is added for CHIP v3: a function-call key on CHIP limited to `mine_deploy` and `claim_starter`, no
  deposit, 0.25 NEAR of gas. The old poker key is untouched.
- **CHIP is the only coin that can be staked without a popup.** Any other coin is `ft_transfer_call`
  with 1 yoctoNEAR, which needs the wallet or the email signer for each stake. The page says so.
- `stakeCall()` in `grid.ts` builds the stake call; the page and `scripts/near/prove-grid-user.ts`
  both use it, and `tests/near/grid.test.ts` pins what it sends.
- Someone must settle each round. `npm run keeper:near` does it (the Foreman replaces it in Phase 4);
  the mine page also has a "Settle round" button anyone can press.

## What was verified (2026-11-14)

- `npm run lint`, `npm run typecheck` clean; `npm test` 332 pass (9 new, in `tests/near/grid.test.ts`).
- Every page rendered in a browser against the testnet deployment, console clean; numbers matched the
  chain audit. Mobile (375 px): no horizontal overflow.
- Chain-level proof of the brief's test, `npm run prove:near-user` (`proof-grid-user.json`): a new
  account approves once, claims 1,000 CHIP and mines 3 rounds; all 7 later transactions are signed by
  the game key; the key is refused when it attaches a deposit, calls another method (`ft_burn`) or
  another contract; the balance equals 1,000 less stakes plus returns plus emission, read from the
  mine's own records. In that passing run all 3 rounds were refunds (the account was the only
  player), so it did not win. An earlier run won round 29910868 (46 CHIP back and 10 CHIP minted to
  the winner, [settle tx](https://testnet.nearblocks.io/txns/GFCo9pgZWWxvUfphGSuEQHdmwGVCMPj1ma2pvz3VZxna));
  its final check failed only because the script did not yet count the emission, since fixed.

## NOT verified

- **Email sign-in on the page.** Privy is not configured on this machine (no `.env`), so the email
  flow, the funding route and the Privy signer were not run. The chain steps they perform were run
  with a script. Wallet sign-in was not driven either (no wallet extension here).
- **The page's own stake panel, auto-mine loop, settle button and open-a-mine form** were not
  exercised in a browser, because they need a signed-in session. Their logic is covered only by the
  shared `stakeCall` test and the script above.
- Staking a coin other than CHIP from an email account (JAMBO): not run.

## Findings that need a decision or a setting

- **Gas reserve.** NEAR reserves about 0.001 NEAR per attached Tgas up front and refunds the unused
  part; a stake attaches 80 Tgas, so the account needs about 0.08 NEAR free, and about 0.004 NEAR is
  burned per stake. An email account funded with the 0.1 NEAR in `.env.example`
  (`NEAR_EMAIL_FUND_YOCTO`) can make only a handful of stakes before it is stuck. Fund at least 0.5.
- The keeper needs about 0.15 NEAR free per settle for the same reason.
- On a phone the stake button sits below the board; picking a square then scrolling is a known rough
  edge, not fixed.
- The header's account chip still links to the old `/near/account` page (the poker account page);
  sign-out lives there.
- The share image (`opengraph-image`) is still the poker one; the new pages set no card rather than
  show a wrong one.

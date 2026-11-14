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

- `npm run lint`, `npm run typecheck` clean; `npm test` 337 pass (14 new, in `tests/near/grid.test.ts`).
- Every page rendered in a browser against the testnet deployment; numbers matched the chain audit.
  Mobile (375 px): no horizontal overflow.
- **Chain-level proof of the brief's test**, `npm run prove:near-user` (`proof-grid-user.json`): a new
  account approves once, claims 1,000 CHIP and mines 3 rounds; all 7 later transactions are signed by
  the game key; the key is refused when it attaches a deposit, calls another method (`ft_burn`) or
  another contract; the balance equals 1,000 less stakes plus returns plus emission, read from the
  mine's own records. In that passing run all 3 rounds were refunds (the account was the only
  player). An earlier run won round 29910868 (46 CHIP back and 10 CHIP minted to the winner,
  [settle tx](https://testnet.nearblocks.io/txns/GFCo9pgZWWxvUfphGSuEQHdmwGVCMPj1ma2pvz3VZxna)); its
  final check failed only because the script did not yet count the emission, since fixed.
- **The real page, driven in a browser** with the developer sign-in below (a funded testnet account's
  own key, no wallet and no Privy):
  - sign-in, the setup card, "Turn on the game key" (one approval) and the starter state;
  - staking CHIP on a square with the game key, no popup, with the board, "you" marker, balance and
    notice updating;
  - **auto-mine** for several rounds (it staked on a random square each round and counted down);
  - a stake pinned to a round that had just ended was refused by the contract and the page said so
    ("that round has ended. Your coins were returned");
  - the **Settle button**: success ("Round N settled", banner clears, Last round updates) from an
    account with enough NEAR, and a plain-English refusal from one without;
  - staking **JAMBO** (a transfer signed by the account, 1 yoctoNEAR) through the page;
  - the open-a-mine form states ("already has a mine", "the factory does not accept this coin");
  - the **sign-out** button, and the pinned stake bar on a phone-sized screen.

## Developer sign-in (testing only)

`near-session.tsx` accepts a testnet account's own key from this browser's localStorage
(`kova.near.testkey.v1`, `{accountId, key}`), but only on `localhost` or `127.0.0.1` and only on
testnet, so on a deployed host it does nothing even if the key is present. It exists to test the
real pages without a wallet extension or Privy. Nothing reads or writes the key unless a developer
sets it by hand.

## NOT verified

- **Email sign-in on the page.** Privy is not configured on this machine (no `.env`), so the email
  flow, the funding route and the Privy signer were not run. Their chain steps were run with scripts.
  Wallet-extension sign-in was not driven either.
- Auto-mine was watched for several rounds, not for its full count or for a long unattended run.
- The keeper was run for a few minutes at a time, not as a long-lived service.
- Mainnet: nothing here touches it.

## Findings

- **Gas reserve.** NEAR reserves about 0.001 NEAR per attached Tgas up front and refunds the unused
  part; a stake attaches 80 Tgas, so the account needs about 0.08 NEAR free, and about 0.004 NEAR is
  burned per stake. An email account funded with the 0.1 NEAR in `.env.example`
  (`NEAR_EMAIL_FUND_YOCTO`) can make only a handful of stakes before it is stuck. Fund at least 0.5.
  A settle reserves about 0.15 NEAR, so most players cannot press Settle; the keeper (or the
  Foreman) has to do it. The page now says this in words instead of showing raw numbers.
- **Public RPCs rate-limit, hard.** `rpc.testnet.near.org` and `rpc.mainnet.near.org` answer 429
  "deprecated"; FastNEAR's free tier throttled one open page plus a keeper. The fallbacks are now the
  providers listed at docs.near.org/api/rpc/providers (dRPC, Intear, ZAN), each checked for a view
  call and browser access on 2026-11-14. The pages poll less (about 1 request a second), a failed
  first read retries within 5 seconds, and `NEXT_PUBLIC_NEAR_RPC_URL` sets a dedicated endpoint.
  **A real deployment needs a dedicated RPC.**
- The RPC client hides the real reason for a rejected transaction behind "Exceeded 2 providers"; its
  `errors` array carries it. The session reads that array and checks the balance itself.
- A hydration error on `/near/chip` (a loading placeholder inside a paragraph) was found while
  testing and fixed.
- The keeper makes about 20 RPC calls a minute (two passes a minute; the full ten-minute look-back
  every fifth pass), not the 180 it first made.
- Left as they are: the share image is still the poker one, so the new pages set no card; the Settle
  notice says "settled" even when the result was a refund.

# Kova on NEAR: what is left to do

This is the one list to hand to your partner. It says what is **still needed**, who has to do it, and
what it unlocks. Written in plain words on purpose.

**How to keep it up to date**
- When something is finished, **delete its line** under "Still to do" and add one line under "Done".
- When a new need comes up, **add it** under the right heading, with who has to do it and why it matters.
- Never put a password, key or secret in this file. Say where it lives, not what it is.

Last updated: 14 Nov 2026, 14:30 Lagos. Submission closes 15 Nov 00:59 Lagos; aim to submit by 23:00 on 14 Nov.

A few words used below: a **mine** is the game board (5×5 squares) for one coin. The **keeper** is a small
program that finishes each round so winners get paid. The **Foreman** is an account that plays beside
the players and posts a short summary of every round.

---

## Still to do

### 1. Only you can do these (they need your money, your accounts or your decision)

- [ ] **Send testnet NEAR (about 3) to `kova-v3-mwg6hrmb.testnet`.**
  Why: almost everything left needs a little NEAR to run, and the free faucet is locked until about
  22:00 Lagos. It unlocks: a clean full test run, keeping the keeper and Foreman running during the demo,
  and the test launch on meme.cooking. Testnet NEAR is free, from your own testnet account.
- [ ] **Decide: do we go to mainnet (real money) or stay on testnet for the submission?**
  Going to mainnet costs real NEAR: about 21 NEAR is burned for good just to publish the game code, plus
  several more for the other contracts, so plan on roughly 26 NEAR or more. Staying on testnet costs
  nothing and is fine if it is clearly labelled (it is). I will not touch mainnet until you say "go".
- [ ] **Decide three small settings** (my advice in brackets):
  - Free starter CHIP on mainnet: switch it off? (yes; fake accounts could drain it)
  - Lock the testnet CHIP and factory accounts so nobody can change them? (not yet; do it at the very end, because a bug found later would need a full redeploy)
  - May I push the work to GitHub for backup? (yes, to the `kova-v3` branch only, never `main`)

### 2. Ask your partner (send secrets safely, not in chat)

- [ ] **Privy app ID and secret.** Unlocks email sign-in, which has never been tested because those
  values are not on this computer. Also raise the NEAR given to new email users to at least 0.5 NEAR
  (the setting is `NEAR_EMAIL_FUND_YOCTO`), or they get stuck after a few moves.
- [ ] **Hosting access** for near.kova.surf (the server, the domain settings) so the new site can go live.
- [ ] **A paid or dedicated NEAR connection address** for the website (`NEXT_PUBLIC_NEAR_RPC_URL`). The
  free public ones slow down under load and can make the site look broken.
- [ ] **Team details for the submission form:** team lead, team size, and the NEAR account that gets paid.

### 3. Optional, makes the demo stronger

- [ ] **A BRRRAIN key** (make it at `brrrain.fun/app/keys`; the account must hold at least 1 BRRRAIN).
  Save it to a file outside the project, for example `~/.kova-testnet/brrrain.key`, and tell me. Then the
  Foreman adds one short AI sentence to each round summary. Without it, summaries are plain templates
  (and the site says so).

### 4. Your part of the submission (due 23:00 Lagos)

- [ ] README: NEAR first, credit ORE for the idea, steps to reproduce. (I can draft it. Ask.)
- [ ] Demo video, under 2 minutes. (I can write the script. Ask.)
- [ ] Post on X with #NEARHackathon and @NEARProtocol.
- [ ] Fill in and send the submission form.

### 5. I can do these as soon as the money or key above arrives

- [ ] **Launch a test coin on meme.cooking's testnet and give it a Kova mine.** Needs about 2.3 testnet
  NEAR (0.25 for the launch, about 2 for a new testnet game factory that accepts meme.cooking coins).
  This also finally proves the whole "new coin joins Kova" path end to end.
- [ ] **One clean full test run** (`npm run prove:near`). It never finished in one go because testnet NEAR ran out.
- [ ] **Run the Foreman with the BRRRAIN key** and check the AI sentence really works.
- [ ] **Mainnet,** only after your explicit "go": publish the contracts, open the first mines (JAMBO,
  PURGE, and BRRRAIN once it can be sent). I will stop and ask before every step that costs real money.
- [ ] **Keep the keeper and Foreman running** on a server, so rounds finish without anyone watching.

### 6. Known rough edges (small, not blocking)

- [ ] Email sign-in and wallet-extension sign-in have never been run on the real site (no Privy keys / no wallet here).
- [ ] The picture that shows when the site is shared is still the old poker one, so the new pages show none.
- [ ] After "Settle", the message says "settled" even when the round was a refund.
- [ ] On a phone the "stake" bar works but has only been checked in a browser simulation.
- [ ] Auto-mine and the keeper were watched for a few minutes, not for hours.
- [ ] Older Foreman posts say "(-1 CHIP net)" for a win; newer ones say it more accurately. Old posts stay on the chain as they are.

---

## Keep safe

- [ ] **Back up the folder `~/.kova-testnet` on this Mac** (somewhere private, not GitHub). It holds the
  keys for every testnet account we made. If this computer is lost, those accounts are lost. Never
  commit it, never paste it in chat.

## How to run the demo (on this Mac)

1. Start the site: `npm run dev`, then open `http://localhost:3000/near`.
2. Start the keeper so rounds finish (needs the main account to hold at least 0.2 NEAR):
   `KEEPER_ACCOUNT=kova-v3-mwg6hrmb.testnet KEEPER_KEY_FILE=$HOME/.kova-testnet/kova-v3-mwg6hrmb.testnet.key npm run keeper:near`
3. Start the Foreman (it needs about 0.01 NEAR per round): `FOREMAN_ROUNDS=10 npm run foreman:near`
4. To try the site without a wallet on this Mac, the developer sign-in is described in `docs/near/v3/SITE.md`.

---

## Done (short, for context)

- [x] The three contracts (the game board, the coin, the factory that opens boards) are written and tested: 53 unit tests plus a full run on a local test network.
- [x] Deployed on NEAR testnet on new accounts; a real game was played there with exact payouts and a 10% burn. Details: `docs/near/v3/DESIGN.md` and `testnet.json`.
- [x] The website: landing page, mines list, live game board, open-a-mine, CHIP page with a live "no admin key" check, leaderboard, Foreman panel, "cooking now" panel.
- [x] A new account can sign in once, claim CHIP and play rounds with no pop-ups (proven with a script and on the real page).
- [x] The keeper (finishes rounds) and the Foreman (plays and posts summaries), both run live on testnet.
- [x] Opening a mine now also registers it with its coin, so the coin can be sent to it. Proven on a real testnet token.
- [x] meme.cooking and BRRRAIN documents read and checked; the real details are written down in `DESIGN.md`.
- [x] Everything on the branch `kova-v3` passes the checks (360 tests). Nothing is pushed yet; nothing is on mainnet.

Where the details live: `DESIGN.md` (how it works and what was checked), `SITE.md` (the website and what was
tested), `testnet.json` and `foreman.json` (the testnet addresses).

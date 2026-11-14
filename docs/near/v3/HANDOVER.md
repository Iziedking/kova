# Kova on NEAR: what is left to do

One list for you and your partner. It says what is still needed, **who** does each thing, **in what
order**, and what each one unlocks. Plain words on purpose.

**Who** is one of: **You** (needs your money, accounts or decision), **Partner** (needs their access or
secrets), **Me** (the AI builder; I do it once what it needs has arrived).

**How to keep this file up to date**
- When something is finished, **delete its line** and add one line under "Done" at the bottom.
- When a new need comes up, **add it** in the right place, with Who, why it matters, and what it costs.
- Never put a password, key or secret in this file. Say where it lives, not what it is.

Last updated: 14 Nov 2026, 17:21 Lagos. Submission closes 15 Nov 00:59 Lagos; aim to submit by 23:00 on 14 Nov.

Words used here: a **mine** is the game board (5×5 squares) for one coin. The **keeper** is a small program
that finishes each round so winners get paid. The **Foreman** is an account that plays beside players and
posts a short summary of every round. **Testnet** is the practice network (free coins). **Mainnet** is the real one.

---

## A. What it takes to open a mine (so you know what to tell people)

To open a mine for a coin, a person needs:
1. **A coin the factory accepts.** Today (testnet) that is only CHIP and JAMBO, and both already have a mine,
   so nothing new can be opened yet. Planned for mainnet: BRRRAIN, plus any coin launched on meme.cooking
   (its address ends in `.meme-cooking.near`).
2. **The coin has no mine yet.** One mine per coin.
3. **A signed-in NEAR account with about 0.5 NEAR free.** Only about 0.2 NEAR is really spent (it goes to the
   new mine to run on). The rest is held back for a moment as a gas deposit and almost all is returned. (I attach
   far more gas than needed; lowering it is on the list in section C, step 10.)
4. **About 0.00125 NEAR more** for step two: registering the mine with the coin so the coin can be sent to it.
5. **Two numbers**, in the coin's own units: the smallest stake, and the most one player can stake per round.
   **These are fixed for the mine's whole life.** The form suggests safe numbers and warns about odd ones, but the opener decides.
6. After it is open: **someone must run the keeper** (or the Foreman) so rounds finish, and players need some
   of the coin. Every coin except CHIP needs a wallet confirmation for each stake.

---

## B. Decisions made (14 Nov)

- [x] **Testnet for the submission, not mainnet.** Nothing costs real money. Mainnet (roughly 26 NEAR, about 21 of it burned for good) is only worth revisiting if you change your mind; section C, step 9, says what it would take.
- [x] **Free starter CHIP: switch it off on mainnet.** It stays **on** for testnet, where CHIP is worthless and the demo needs it. This only takes effect if we ever deploy to mainnet.
- [x] **Stake limits are pre-filled and checked.** The Open form suggests safe numbers from the coin's supply and warns in plain words about odd ones. The opener can still choose; the limits are still fixed forever.
- [x] **Locking the testnet CHIP and factory accounts: not yet.** Do it at the very end (it would be a question to you first).
- [x] **The work is pushed to GitHub** on branch `kova-v3` (never `main`) as a backup. Nothing has been merged.

---

## C. The order to do things

**Step 2 leftover: more testnet NEAR.  Who: You (optional)**
- [ ] About **2.5 NEAR more** to `kova-v3-mwg6hrmb.testnet`, only if you want the full "new coin joins Kova" proof
  (0.25 for a test launch on meme.cooking, about 2 for a new testnet factory). You sent 2 NEAR already, which
  is enough for the clean test run and to keep the keeper and Foreman going.
- [ ] Keep the backup zip `~/kova-testnet-backup.zip` somewhere **off this Mac** (an external drive or a password
  manager). It is made, but it is no use if it only lives here. Re-make it if new accounts are added.

**Step 4: get what only your partner has.  Who: Partner (send secrets safely, not in chat)**
- [ ] **Privy app ID and secret.** Unlocks email sign-in, never tested because those values are not on this
  computer. Also raise the NEAR given to new email users to at least 0.5 NEAR (setting `NEAR_EMAIL_FUND_YOCTO`),
  or they get stuck after a few moves.
- [ ] **The NEAR AI Cloud key** the House already uses (`NEAR_AI_API_KEY_FILE`). Put it in a file outside the
  project. The Foreman then uses it as its backup AI voice (a key alone is enough now). See step 6.
- [ ] **Hosting access** for near.kova.surf (the server and the domain settings) so the new site can go live.
- [ ] **A paid or dedicated NEAR connection address** for the website (`NEXT_PUBLIC_NEAR_RPC_URL`). The free
  public ones slow down under load and can make the site look broken.
- [ ] **Team details for the submission form:** only the NEAR account that gets paid is missing (the team names are in the README; please confirm them).

**Step 5: your own part of the submission (due 23:00).  Who: You and Benita**
- [ ] **Read the README** (top of `README.md`) and check every line is right. The team names there (Israel Dominic,
  lead developer; Benita Ukachi, frontend, social and demo) were already in the old README; confirm them.
- [ ] **Record the demo video** (under 2 minutes) with `docs/near/v3/DEMO-SCRIPT.md` (script, the 10-minute setup, and what to leave out).
- [ ] **Post on X** with #NEARHackathon and @NEARProtocol (a draft is at the bottom of the demo script).
- [ ] **Decide which branch judges see.** Everything is on `kova-v3`. If you merge it into `main`, change the
  disclosure link in the README (`pre-hackathon...kova-v3`) to match.
- [ ] **Check the live site before linking it.** Today `near.kova.surf` is still the older poker version. Do not
  link it as "the new Kova" until Step 8 (go live) is done; link the repo instead, or record on this Mac.
- [ ] **Fill in and send the submission form.** Still needed from your partner: the NEAR account that gets paid.

**Step 6: connect the AI keys. THE AI IS CENTRAL TO KOVA, so this is the most important open item.  Who: You and Partner, then Me**
How it works: the Foreman asks **NEAR AI Cloud first** and **BRRRAIN as the backup** for one sentence of commentary on each
round. The site always says the Foreman is powered by AI, and shows a live "AI status" line that is honest: "live" only when
the latest recap really carried an AI sentence, otherwise "waiting for an AI key". Both are wired in and tested against a
fake server. They are off only because **no key is on this computer**. One working key is enough to turn the AI on.
- [ ] **NEAR AI Cloud key (first choice). DECIDED: we use your partner's key. Who: Partner.** Ask them for the key the House
  already uses (the one behind `NEAR_AI_API_KEY_FILE`). Send them this message: *"Please send me the NEAR AI Cloud API key
  the House uses, privately (not in a group chat or email). Also tell me whether the account still has credits, and which
  model the House is set to."* Then save it as the only content of `~/.kova-testnet/nearai.key` with the safe command
  below (nothing shows on screen when you paste). If they have no key, make one yourself: sign up at
  **https://cloud.near.ai**, add credits (paid; the amount is yours to choose), open **API Keys** (once signed in:
  `cloud.near.ai/dashboard/api-keys`), generate a key. Steps are from `docs.near.ai/cloud/quickstart`.

  ```bash
  read -s "K?Paste the NEAR AI key, then press Enter: "; echo; printf '%s' "$K" > ~/.kova-testnet/nearai.key; chmod 600 ~/.kova-testnet/nearai.key; unset K; echo saved
  ```
- [ ] **BRRRAIN key (backup, optional). Who: You.** A key was made and saved at `~/.kova-testnet/brrrain.key` on 14 Nov. The
  check says the key itself is valid (for `wiserice9309.near`) **but that account holds 0 BRRRAIN and has 0 Power**, so BRRRAIN
  refuses to answer. Two things to know: (1) the account must hold at least 1 BRRRAIN; (2) BRRRAIN gives each day's Power at
  00:00 UTC to the tokens held the day before, so **tokens bought today give Power only from tomorrow 00:00 UTC, which is
  01:00 in Lagos on 15 Nov, after the 00:59 deadline.** BRRRAIN therefore cannot power the AI for the submission; NEAR AI
  Cloud can. **That key was pasted in chat, so revoke it at `brrrain.fun/app/keys` and make a fresh one before relying on it.**
- [ ] **Check them. Who: You.** Run `npm run ai:check`. It checks NEAR AI first, then BRRRAIN, and says in plain words whether
  each key works (and for BRRRAIN whether the account holds enough and how much daily Power is left). Then
  `npm run ai:check -- --call` asks for one real sentence.
- [ ] **Run the Foreman with them. Who: Me (or You).** `NEAR_AI_API_KEY_FILE=$HOME/.kova-testnet/nearai.key BRRRAIN_API_KEY_FILE=$HOME/.kova-testnet/brrrain.key npm run foreman:near`.
  Then the site's AI status line should say "live". Tell me and I will verify it on the page and in a recap on chain.
- [ ] **Record the demo only after that,** so the video shows the AI really working (see the demo script).

**Step 7: the full test run and the new-coin proof.  Who: Me, after step 2**
- [ ] Launch a test coin on meme.cooking's testnet, deploy a new testnet factory that accepts it, open its mine
  with the two-step button, and stake it. This is the first time the whole "new coin joins" path runs for real.
  It also confirms how testnet meme.cooking coins are named (still a guess).

**Step 8: put the site online.  Who: Partner (access) then Me**
- [ ] Set the new settings (Privy, NEAR AI, RPC address, the new Kova addresses) and deploy the site.
- [ ] Keep the keeper and the Foreman running on a server so rounds finish without anyone watching.

**Step 9: mainnet. NOT PLANNED (you chose testnet). Only if you change your mind: You decide, then Me, after your explicit "go"**
- [ ] Publish the contracts; open the first mines (JAMBO, PURGE, and BRRRAIN once it can be sent).
- [ ] **Check BRRRAIN first** (needs a small amount of real BRRRAIN, so **You**): that it can be sent between
  accounts and that its burn works. Nothing has been called on it yet.
- [ ] Set the free starter CHIP to 0. Keep stake limits small. Decide about locking the keys.
- [ ] Say plainly in the README that the contracts have **no audit**.

**Step 10: smaller things, any time.  Who: Me**
- [ ] **Revenue plan** (README, "Path to revenue"): after the submission, build the opening fee first (a new factory,
  about 2 testnet NEAR), then the protocol fee (a new mine version: new publish, about 21 NEAR, full retest).
  **Needs from you and your partner:** one treasury NEAR account you both control, how you split it, and the fee
  sizes (proposed: a fixed opening fee, and 1 to 2% of losing stakes). Nothing is charged today.
- [ ] After step 7, lower the gas the Open button attaches (it needs far less than it holds back), so openers
  need much less NEAR free.

---

## D. I can do these right now, with nothing from you

Say the word and I start. None of them need money or keys.
- [ ] Write a "go live" guide for your partner (what to set, in what order).
- [ ] Make a proper share picture for the new pages (the old poker one is wrong for them).
- [ ] Fix small wording: after "Settle" the message says "settled" even when the round was a refund.

---

## E. Known rough edges (small, not blocking)

- [ ] Email sign-in and wallet-extension sign-in have never been run on the real site (no Privy keys / no wallet here).
- [ ] Auto-mine and the keeper were watched for a few minutes, not for hours.
- [ ] **Leaderboard in production:** the keeper and the site must share the `data/standings.json` file (same machine), or the books must move to a database. Your partner has Postgres (`KOVA_DATABASE_URL`); ask for it when going live. Rounds settled while the keeper is off are not counted.
- [ ] Older Foreman posts say "(-1 CHIP net)" for a win; newer ones say it more accurately. Old posts stay on the chain.
- [ ] A coin's token must follow the usual standard for staking and registering to work. meme.cooking's and
  BRRRAIN's tokens are expected to, but that is not confirmed.
- [ ] Every coin except CHIP needs a wallet confirmation per stake (a "no pop-ups" version for other coins would
  need a bigger redesign; not planned).
- [ ] About 69 testnet NEAR is stuck in test accounts whose keys were lost early on. Nothing to do; just do not count on it.

---

## Where the secrets live (names and places only; never the values)

All secret keys stay on this Mac in the private folder `~/.kova-testnet` (readable only by you, never inside the project,
and the project's `.gitignore` also blocks `*.key` files so a copy cannot be committed by mistake).

| File in `~/.kova-testnet` | What it is | If it leaks |
| --- | --- | --- |
| `<account>.key` (one per testnet account) | A testnet account's key. Testnet coins, no real value. | Low: testnet only, but the Foreman and keeper accounts would need re-creating. |
| `foreman.<account>.deploykey` and `.postkey` | The Foreman's two limited keys (stake CHIP, post recaps). | Low: they can only stake CHIP and post. |
| `brrrain.key` | BRRRAIN API key for `wiserice9309.near`. **It was pasted in chat on 14 Nov: revoke it at `brrrain.fun/app/keys` and make a fresh one.** | It can only spend that account's BRRRAIN Power. Revoke it. |
| `nearai.key` (to come, from your partner) | NEAR AI Cloud API key. | It spends the partner's NEAR AI credits. Revoke it in the NEAR AI dashboard and make a new one. |

- [ ] **After the NEAR AI key is saved, re-make the backup zip** (`cd ~ && zip -r kova-testnet-backup.zip .kova-testnet`) and move it
  off this Mac again, so the new keys are in the backup too. A backup holds every secret, so keep it somewhere private.

---

## How to run the demo (on this Mac)

1. Start the site: `npm run dev`, then open `http://localhost:3000/near`.
2. Start the keeper so rounds finish (the main account must hold at least 0.2 NEAR):
   `KEEPER_ACCOUNT=kova-v3-mwg6hrmb.testnet KEEPER_KEY_FILE=$HOME/.kova-testnet/kova-v3-mwg6hrmb.testnet.key npm run keeper:near`
3. Start the Foreman (about 0.01 NEAR per round): `FOREMAN_ROUNDS=10 npm run foreman:near`
   (add `BRRRAIN_API_KEY_FILE=$HOME/.kova-testnet/brrrain.key` to turn on the AI sentence).
4. To try the site without a wallet on this Mac, see the developer sign-in in `docs/near/v3/SITE.md`.

---

## Done (short, for context)

- [x] The three contracts (game board, coin, factory) are written and tested: 53 unit tests plus a full run on a local test network.
- [x] Deployed on NEAR testnet on new accounts; real rounds played there with exact payouts and a 10% burn. See `DESIGN.md` and `testnet.json`.
- [x] The website: landing page, mines list, live game board, open-a-mine, CHIP page with a live "no admin key" check, leaderboard, Foreman panel, "cooking now" panel.
- [x] A new account signs in once, claims CHIP and plays rounds with no pop-ups (proven with a script and on the real page).
- [x] The keeper and the Foreman both run live on testnet.
- [x] One clean full test run on testnet passed end to end (`npm run prove:near`): 8 rounds in both mines, exact payouts, exact 10% burn, books balanced.
- [x] New share picture (the card shown when the link is posted), the old "Classic" links removed, and the old poker pages hidden (they return 404; `KOVA_NEAR_CLASSIC=true` brings them back; deleting them for good is a later step, after go-live).
- [x] Global leaderboard: the keeper records every round (who staked, won, lost and burned, per coin) and the site ranks players across all coins. It is recorded from when the keeper starts, in `data/standings.json` on the machine the keeper runs on (the site must read the same file; a shared database is the production version).
- [x] `npm run ai:check` verifies the NEAR AI and BRRRAIN keys without printing them.
- [x] Opening a mine registers it with its coin as a second step, with a Register button as a safety net. Proven on a real testnet token.
- [x] The AI voice for the Foreman is built with NEAR AI Cloud first and BRRRAIN as the backup (not yet run with real keys).
- [x] meme.cooking and BRRRAIN documents read and checked; the real details are in `DESIGN.md`.
- [x] The Open form suggests stake limits from the coin's supply and warns about risky ones (tested, and checked on the real page).
- [x] Key folder backed up to a zip (move it off this Mac, see step 2 leftover); 2 testnet NEAR received.
- [x] README rewritten for the new Kova (ORE credited, limits stated plainly), plus a demo script and an X post draft.
- [x] Everything on branch `kova-v3` passes the checks and is pushed to GitHub as a backup. Nothing is on mainnet.

Where the details live: `DESIGN.md` (how it works and what was checked), `SITE.md` (the website and what was
tested), `testnet.json` and `foreman.json` (the testnet addresses).

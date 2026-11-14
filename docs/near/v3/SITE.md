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

## Phase 4: the Foreman and "cooking now" (2026-11-14)

### The Foreman (`scripts/near/foreman-setup.ts`, `foreman.ts`; rules in `src/adapters/near/foreman.ts`)

- **Account:** `foreman.kova-v3-mwg6hrmb.testnet`, created with two function-call keys and **no
  full-access key** (`docs/near/v3/foreman.json`, public keys only; the secret keys are in
  `~/.kova-testnet`, outside the repo). The deploy key can only call CHIP's `mine_deploy` and
  `claim_starter`; the post key can only call `set` on the testnet social contract. Neither attaches a
  deposit, so neither can move NEAR or CHIP. The site reads the key list from the chain and shows it.
- **What it does:** each round it puts 10 CHIP on two squares picked by `sha256("kova-foreman-v1|account|round|n")`
  (rejection sampling, so every square is equally likely, and anyone can recompute the picks), then
  posts a recap once the round has a result. It stops by itself if it runs low on NEAR or CHIP.
- **How it posts:** SocialDB (`v1.social08.testnet`, github.com/NearSocial/social-db) lets an account
  grant a public key permission to write under its keys (`grant_write_permission`). The funder owns the
  namespace `kova-v3-mwg6hrmb.testnet/kova/foreman` and pays its storage; the post key writes five
  fixed slots in turn, so storage does not grow. Every post is also a transaction signed by the Foreman.
- **Live runs on testnet:** two runs of 6 rounds with the keeper settling. First run: 5 of 6 recaps
  posted; the sixth failed with "Not enough storage balance" (five slots used up the namespace's
  storage before any was overwritten). Fixed by shortening the recap and topping up storage; the
  runner now names that cause. Second run: 6 of 6 posted, including two rounds the Foreman won (19 CHIP
  back on 20 staked, one burned). Example post:
  [tx](https://testnet.nearblocks.io/txns/AtjzZj5vF7qAaH2AQf9W6dttdqRNohjh6NL7GP3dgRKR).
- **Wording fixed after the run:** posts from the second run say "(-1 CHIP net)" for a win; that
  ignores the 10 CHIP of emission a winner is also minted. New posts say "against its stake, not
  counting CHIP minted for winners". The old posts stay on chain as they were.
- **It is a fixed rule, not an AI.** Every post is `by: "rule"`, a template filled from the mine's own
  record, and the site says so. There is no NEAR AI Cloud or BRRRAIN key on this machine, so neither
  was connected, and nothing in the repo claims an AI wrote a recap. The TEE proof is not shown
  because nothing was verified.
- **It does not run by itself.** It needs about 0.09 NEAR free for each stake and a few thousandths
  for each post (about 0.01 NEAR a round), plus the keeper to settle rounds. Testnet NEAR is nearly gone
  and the faucet is locked until about 22:00 Lagos, so it runs only while someone funds and starts it.

### Cooking now (`src/app/api/near/cooking/route.ts`, `cooking-now.tsx`)

- Reads meme.cooking's **mainnet** contract and public index, read only, cached 30 s; it shows what is
  cooking and the most recent launches. At the time of testing nothing was cooking (6 launched). The
  panel says Kova is not affiliated and that these coins have no Kova mine.
- The meme.cooking reader's mainnet fallback was the deprecated `rpc.mainnet.near.org`; it now uses the
  documented providers (same list as the browser client).

### The Foreman's optional AI remark (`src/adapters/near/foreman-voice.ts`)

- Built against BRRRAIN's documented API (and NEAR AI Cloud as the fallback): `BRRRAIN_API_KEY_FILE`
  (or `NEAR_AI_API_KEY_FILE` with `NEAR_AI_MODEL`) names a key file outside the repo. The recap's
  facts always come from the template; the AI adds at most one sentence, rejected if it contains a
  number the facts do not, a link, a handle or a line break. A post says `by: "ai"` only when it names
  the remark and the model, and the site shows that. `quota_exhausted` stops BRRRAIN until 00:00 UTC.
- **Not run with a real key.** No BRRRAIN or NEAR AI key is on this machine, and a BRRRAIN key needs a
  person to make it at `brrrain.fun/app/keys` for an account holding at least 1 BRRRAIN. It is tested
  against a fake server only (`tests/near/foreman-voice.test.ts`); only BRRRAIN's public endpoints were
  read live. Until a key is set, every post is `by: "rule"`.

### Not done in Phase 4

- **A testnet meme.cooking launch, and a Kova mine for it.** Its docs were read (see DESIGN.md), and the
  launch is understood, but it was not run: it costs about 0.25 NEAR (registration 0.02, `create_meme`
  about 0.11, and the soft cap's worth of wrapped NEAR, plus gas), and a Kova mine for the new coin
  needs a new testnet factory (about 2 NEAR to deploy) because the current one accepts only CHIP and
  JAMBO and cannot be changed. Testnet NEAR is nearly gone and the faucet is locked until about 22:00 Lagos.
- **A live AI remark** (above): needs a key.
- A long-running Foreman or keeper service.

## Registering a mine with its coin (added after Phase 4)

A standard coin (NEP-141) can only send to an account it has registered (NEP-145 storage management),
and a new mine does not register itself; only CHIP's own contract does that for mines. So opening a
mine is now two steps on the Open page: the factory creates it, then the page registers it with the
coin with `storage_deposit({account_id: <mine>, registration_only: true})`, attaching the coin's own
`storage_balance_bounds.min` (0.00125 NEAR for the usual token; the token refunds any excess). The
caller pays it. A mine's page also checks, and if the coin does not know the mine it shows a
"Register the mine" button and blocks staking with the reason, so a skipped or failed step can be fixed
by anyone.

- **Proven on a real standard token:** `npm run prove:near-register` registered a never-used account
  with `wrap.testnet`: before, the token said "not registered"; after, "registered", keeping exactly
  0.00125 NEAR; the caller paid that plus gas
  ([tx](https://testnet.nearblocks.io/txns/BnbVUtBEDjzZ8JoQC4q6EFfAPcvsBhNphvcGu4EjUEgD)).
- **On the real page:** with the "not registered" read simulated at the network layer (the current
  CHIP and JAMBO mines are both registered), the banner, the Register button and the staking block
  appeared; pressing Register sent a real transaction and the page confirmed it and cleared the block.
  That run found a real bug (a `null` meaning both "unregistered" and "not read yet"), now fixed with an
  explicit state.
- **The Open sequence** (open, wait for the mine, register) is unit-tested for every branch (open
  fails, mine never appears, registration fails, coin needs none) in `tests/near/open-flow.test.ts`.
- **NOT verified:** the whole sequence on a real new mine for a real standard coin, because the testnet
  factory accepts only CHIP and JAMBO. That needs a new testnet factory (about 2 NEAR). Also not
  verified live: that a transfer to an unregistered account is refused by a given token. That is the
  NEP-141 standard's behaviour, which meme.cooking's and BRRRAIN's tokens are expected, not confirmed, to follow.

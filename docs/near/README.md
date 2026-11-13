# CHIP on NEAR

**Kova is the arena beside the launchpad. Play the launches while they cook.** Kova sits next to
[meme.cooking](https://meme.cooking), NEAR's memecoin launchpad: the play page opens on what is
cooking there now and what launched last, you can call whether an auction reaches its launch line
before it ends, and every card links back to meme.cooking to back the token. Kova reads
meme.cooking's public mainnet contract and its public index; it has no partnership with
meme.cooking. CHIP is a testnet token with no value.

CHIP is a NEP-141 memecoin whose own contract is a poker table. Players stake CHIP, each secretly
picks a coin traded on NEAR (a NEAR memecoin, a meme.cooking launch, or a busy pool such as wNEAR)
or makes a "Will it cook?" call, and the best pick takes the pot. Every pot burns part of itself,
every UTC day either mints or burns depending on how much the community played, and holders who sit
out pay blinds. Clans race each day for a double share of the daily mint. The meme is poker, and
every rule behaves like poker.

Built during NEAR Hackathon (window opened 2026-10-19). Tracks: `memecoins`, `games`.
Team: Israel Dominic (lead developer: contract, backend, integration) and Benita Ukachi (frontend,
social media posting and the demo).

## What was built in the hackathon

- `near/chip`: the CHIP contract (Rust, near-sdk 5.30.1). NEP-141 token, NEP-145 storage,
  NEP-148 metadata, the tables, the three mechanics and the refunds, in one contract.
- `src/adapters/near`: the NEAR client (near-api-js 7.4.0), the NEAR market price feed (one pinned
  pool per coin), the meme.cooking reader (`meme-cooking.ts`) and the "Will it cook?" results the
  settler reports (`call-prices.ts`, `launch-calls.ts`).
- `src/backend/near`: the settler, the House and the pick store for NEAR mode, off unless
  `KOVA_NEAR_ENABLED=true`.
- `src/features/near`, `src/app/near`: the NEAR play screen and the token page, served on the
  `near.*` host. kova.surf is unchanged.
- `scripts/near`: the 60-day simulation and the end-to-end proof script.

Everything else in this repository was built before the hackathon for Solana and is not part of
this entry.

## The contract on testnet

| | |
| --- | --- |
| Contract | [`kova-chip.testnet`](https://testnet.nearblocks.io/address/kova-chip.testnet) (version 2, with clans) |
| Deploy and init | [one transaction](https://testnet.nearblocks.io/txns/G1oNEdr7ZpdrxzKLXHJE9DT76ofWeUaUGszm28Hdvajj), 2026-11-13 |
| Code | `near/chip/res/kova_chip.wasm`, sha256 `4c526c0b20a31f04208fa51cb7c0ad4c756323a1f86d2d219cfb7200ccd0a967` (bs58 code hash `68vt1eobvgmM4x1zn3ofZBnXetoXqo9bZGYTkZ66Myin`, as NearBlocks shows) |
| Version 1 | [`chip.kingizie.testnet`](https://testnet.nearblocks.io/address/chip.kingizie.testnet), deployed 2026-11-12 without clans and kept as history ([deploy](https://testnet.nearblocks.io/txns/F5YrfUrMmJDNdkfsaNAMbgknEWGMApzfC7ViWeWJbJmz), code hash `6ciJReAW4Qktk4NLrw6hAyh6s9DKjo2c42Nd8KWYZHpa`) |
| Settler | `settler.kingizie.testnet` |
| House | `house.kingizie.testnet`, bankroll 50,000 CHIP at genesis |
| Init arguments | [`near/chip/deploy/testnet-init.json`](../../near/chip/deploy/testnet-init.json) |

Check any of it yourself:

```bash
near contract call-function as-read-only kova-chip.testnet get_config json-args '{}' network-config testnet now
near contract call-function as-read-only kova-chip.testnet get_stats json-args '{}' network-config testnet now
```

## The mechanic, in plain words

**The pot burns.** When a table settles, 10% of the pot is burned. The rest goes to the best pick;
ties split it, with any indivisible unit going to the tied seats in seat order. Check it: the
settle transaction logs an `ft_burn` event with memo `pot_burn:table:<id>`, and `get_stats`
`pot_burned` goes up by that amount.

**The daily call.** Each UTC day needs 30 settled tables. After midnight anyone can call
`close_day(day)`. Target met: everyone who played that day can call `claim_daily(day)` once for a
share of 2,000 newly minted CHIP (`ft_mint`, memo `daily_call:day:<n>`); the leading clan's players
claim two shares and everyone else one, and the shares add up to the 2,000. Target missed: 1% of
the treasury burns (`ft_burn`, memo `daily_miss:day:<n>`). A day closes once.

**Clans.** Founding a clan burns 100 CHIP (`create_clan`, `ft_burn` memo `clan_create:<name>`);
anyone can `join_clan` up to 50 members, one clan per account. A player's clan for the day is fixed
at their first settled table that day. Every settled table counts once for each clan seated at it,
and the clan with the most tables leads the day; on a tie the clan that got there first keeps the
lead. `get_day` shows `top_clan`, `get_clan_day` each clan's tables and players.

**Blinds.** A holder who has not staked at a table for 3 days pays a blind of 1% of their balance
per idle day into the treasury, never taking them below 100 CHIP. The blind is worked out when
their balance next changes (or when anyone calls `collect_blinds`), and `ft_balance_of` already
shows the balance after it. Staking resets the clock. Blinds move chips; they do not burn them.

**Starter chips.** Every account can call `claim_starter` once for 1,000 CHIP from the treasury.
The contract registers the account and pays its storage.

Every parameter is set once by the init call and read back by `get_config`. The contract has no
owner, no setter, no upgrade and no migrate method; the sandbox test fails if one ever appears.
That is the contract's code. The contract account is a separate matter: `kova-chip.testnet`
still holds its full-access key, kept by the lead developer, and that key could deploy new code to
the account. See Limits.

## Who can do what

| Role | Can | Cannot |
| --- | --- | --- |
| Settler (`settler.kingizie.testnet`, run by Kova's worker) | reveal picks with start prices, report end prices, and so decide who wins a table | change any rule, touch the treasury, mint, move a player's chips, or stop a refund |
| Anyone | void a table once its deadline passes (every stake comes back), close a finished day, collect blinds | anything else on someone else's behalf |
| The House | play like any account, from its own bankroll; sits out when it cannot cover a stake | anything a player cannot |

Every stage has a deadline: 10 minutes at most to fill, 2 minutes to start after locking, 5 minutes
to settle after the round ends. If the settler stops, every table becomes refundable by anyone.

The weak point is honest: **prices come from the settler.** The contract cannot see token prices.
The settler reads each pick's price from one fixed mainnet Rhea pool through DEX Screener and
records each price with its source in `near_price_marks`. Every coin is pinned to its pool
(`src/adapters/near/prices.ts`), so a round's start and end prices always come from the same pool.
There is deliberately no fallback source: if the pool cannot be read, the settler retries, and a
table it cannot price in time becomes refundable. The burn, the daily call and blinds do not depend
on any backend.

### What players pick from

NEAR memecoins trade rarely. In a 3-minute sample on 2026-11-12, five of the seven memecoin pools
did not trade at all, and 87% of coin pairs would have tied in a 60-second round. So the picker has
these groups:

- **Will it cook?** Calls on meme.cooking auctions that end within 14 minutes (see below).
- **Trades every minute:** wNEAR (its USDC pool, about 30 to 70 swaps every 5 minutes) and ZEC
  bridged to NEAR through NEAR Intents (its wNEAR pool, about 100 swaps every 5 minutes). These
  produce real winners in 60- and 90-second rounds.
- **Launched on meme.cooking:** JAMBO and PURGE, linked to their auctions on meme.cooking.
- **NEAR memecoins:** BLACKDRAGON, SHITZU, GEAR, LONK and NEKO.

Launch and memecoin picks show their recent swaps, and the app warns when a quiet coin is picked for
a short round, because a coin with no swaps scores 0.

CHIP is the memecoin; the picks are what you bet on. The contract accepts any market id, so the list
lives in the app. The House's fixed rule picks the biggest one-hour mover among coins that are
trading right now.

## Beside meme.cooking

meme.cooking is NEAR's memecoin launchpad: a token is cooked in an auction where anyone deposits
NEAR, and if deposits reach the creator's launch line (the soft cap) by the end, the token launches
on Rhea with its liquidity locked. Kova reads it two ways, and has no partnership with it:

| What | Read from | Used for |
| --- | --- | --- |
| A cooking auction's deposits, launch line, hard cap and end time | `meme-cooking.near` on NEAR mainnet, `get_meme` (and `get_finalized_meme` for a launched one), through public mainnet RPC | the lobby's live numbers and every call's result |
| The list of auctions and launches, with token, pool and depositor count | meme.cooking's public index, `https://api.meme.cooking/meme` | the lobby's lists and the launch dates |

The index can lag the chain by hours, so the numbers that matter always come from the contract,
and the lobby says when the index is behind. The backend caches the lobby for a minute and shows the
last good read, marked, if meme.cooking cannot be read; the tables work either way.

**The lobby.** The play page opens on "Cooking now" (each live auction with its progress to the
launch line, deposits, time left and depositors) and the latest launches with their dates. Every
row links to the token's page on meme.cooking, "Back it on meme.cooking". On 2026-11-13 meme.cooking
had one auction cooking and its last launch was on 2026-10-12, so the lobby says "Latest launches",
not "Just launched", until a launch is under three days old.

**Launch picks.** JAMBO and PURGE launched on meme.cooking and still have pools above the $10,000
liquidity floor; they are their own group in the picker. Of 267 meme.cooking launches, 22 are listed
on DEX Screener and none traded every minute on 2026-11-13 (the busiest, JAMBO, had 55 swaps in a
day), so none passes the busy-pool rule and no fresh launch is added to the picks.

**"Will it cook?" calls.** When an auction ends within 14 minutes, the picker offers "cooks" and
"does not cook" on it. The CHIP contract is unchanged: it accepts any market id, and a call is the
market `mc:<auction>:<SYMBOL>:cooks` or `:flops`. Its value is reported by the settler from
meme.cooking's contract:

- at the start both sides report 1, and only while the auction is still cooking under that symbol;
- at the end, the side that happened reports 2 and the other 1, so the right call scores +100% and
  takes the pot, and the pot burns 10% like every pot;
- an auction counts as cooked if it launched (`get_finalized_meme`) or ended with deposits at or
  above its launch line, and as not cooked if it was finalized without a launch (meme.cooking then
  deletes it) or ended below the line.

The round is set from the auction's end, so it ends about a minute after the auction; the settler
retries until the result is on chain, and a table it cannot settle in time is refundable like any
other. Against the House, its public rule calls "cooks" once deposits have reached the launch line
and "flops" before that. A call by two seats on the same side splits the pot.

The CHIP contract cannot read meme.cooking itself: meme.cooking is on mainnet only (the
`meme-cooking.testnet` account has no contract) and CHIP is on testnet. So a call's result has the
same trust as a price: the settler reports it, and each report is stored with its source in
`near_price_marks`.

**Launch scouts.** The leaderboard has a second view, "Launch scouts": every settled seat whose
pick was a meme.cooking launch or a call, ranked by pots taken, then net CHIP on those seats. A
winning launch pick gets its own share card ("I called BLYA64 before it cooked on @memedotcooking")
with the burn, a link to back the token on meme.cooking and the table link; the X post adds "Built
at NEAR HACKATHON. @NEARProtocol #NEARHackathon".

**Clans back launches.** Launch tables are ordinary tables, so they count for the clan race. A
clan's page lists the launches its current members played and how they did.

## The game key: what NEAR enables here

The first approval in the app adds a NEAR function-call access key to the player's account. It can
only call CHIP's game methods (`claim_starter`, `open_table`, `join_table`, `lock_table`,
`void_table`, `close_day`, `claim_daily`, `collect_blinds`, `create_clan`, `join_clan`,
`leave_clan`), it carries at most 0.25 NEAR of gas,
and it cannot attach a deposit, so it cannot move NEAR or transfer CHIP (`ft_transfer` needs one
yoctoNEAR). After that approval a round needs no wallet popup. The key lives in the player's
browser; anyone who stole it could only play tables with that player's chips.

## Two ways to sign in: a wallet or an email

- **A wallet** (Meteor, Intear and others, through NEAR Connect). The player holds their own keys
  and approves the game key in their wallet.
- **An email**, through Privy. Privy runs the email code login and keeps a NEAR wallet for that
  login; Kova never sees its key. The wallet is a NEAR implicit account (64 hex characters, which
  are its public key). An implicit account exists on chain only once it receives NEAR, so the
  first time, the browser signs a short message with the new wallet (it names the Privy login, the
  network and the contract) and Kova's backend sends the account 0.1 testnet NEAR from a sponsor
  account of its own (`POST /api/near/email-account`; never the settler, whose NEAR pays for
  settling). The backend checks the Privy login and that signature,
  funds each login once, caps new accounts per day, and records the intent before the transfer so
  a retry never pays twice. Then the same single approval adds the game key, signed by Privy's
  wallet instead of a wallet extension, and the game key claims the starter chips.

After sign-in both paths are the same: the same contract, the same game key, the same tables.
Privy's wallet is a third-party wallet held for the player, not self-custody; players who want
their own keys use a wallet.

## The simulation

[`scripts/near/chip-simulation.ts`](../../scripts/near/chip-simulation.ts) runs the same rules for 60
days in five communities and four parameter sets, seeded so it reproduces exactly
(`npm run near:simulate`). Output: [`chip-simulation.json`](chip-simulation.json) and the chart below.

![Simulated CHIP supply and treasury over 60 days](chip-supply.svg)

| Scenario (chosen parameters) | Supply after 60 days | Days the target was met |
| --- | --- | --- |
| Busy community | +1.3% | 58 |
| Quiet community | -33.4% | 0 |
| One whale | -21.1% | 20 |
| Starter farmers (900 sybil accounts) | -9.6% | 5 |
| Most holders never play | -21.5% | 12 |

Clans are in the run: 60% of holders sit in five clans, and on a met day the leading clan's
players claim two shares of the mint. On every one of the 478 met days across all scenarios and
parameter sets, the clan split and the equal split both hand out the same fixed daily mint (the
script checks this and stops if not). Supply moves slightly against the run without clans
(busy +1.3% instead of +1.5%) only because different holders end up with the mint, which changes
who can afford which stake later; the daily total is unchanged.

Why these numbers: with a 30-table target and a 2,000 CHIP daily mint, a busy community roughly
holds supply flat while a quiet one loses a third of it, so play is what keeps CHIP from shrinking.
The first draft (target 20, mint 5,000) inflated every active community by 13 to 18%, and the harsher
set burned most of the treasury inside two months. Blinds at 1% a day pulled 404k farmed starter
chips back into the treasury in the farmer run without taking any account below 100 CHIP.

## Run it

Hosted: https://near.kova.surf.

1. Open https://near.kova.surf. You see CHIP's supply, today's call and the House's bankroll, read
   from the contract. Press "Play the launches" to reach https://near.kova.surf/play.
2. The play page opens on "Beside the launchpad": what is cooking on meme.cooking and the latest
   launches, each with "Back it on meme.cooking".
3. Press "Connect wallet" with a NEAR testnet wallet, or "Continue with email" and enter the code
   Privy emails you (Kova creates and funds the NEAR account the first time). Then press "Approve
   once and get 1,000 CHIP". One approval adds the game key and claims your starter chips. Your
   balance shows 1,000 CHIP.
4. If an auction ends within 14 minutes, pick "<SYMBOL> cooks" or "<SYMBOL> does not cook" under
   "Will it cook?"; the round runs until it ends. Otherwise pick a coin from "Trades every minute",
   a stake and "60 s". Press "Play the House". The House opens a two-seat table and you take the
   other seat with no popup. The table shows "Locking prices", then the countdown.
5. At the end you see the result, the House's reason for its pick, and "This pot burned N CHIP.
   Supply is now X." The supply counter drops by N, and today's call moves up by one table. A
   winning call or launch pick shows "You called it" with a link to back the token on meme.cooking.
6. Open the token page: the burn is the top line of the mint and burn log, with its transaction.
   The leaderboard ranks every player by net CHIP (awards minus stakes) over settled tables, by
   NEAR account name, and "Launch scouts" ranks the meme.cooking picks. It is built from the
   contract's `get_tables` view, so `GET /api/near/leaderboard` can be checked against the chain;
   refunded tables do not count.

Challenge a friend: in step 3 choose "Challenge a friend", pick 2, 3, 4 or 6 seats, a stake and a
round, and press "Challenge a friend for N CHIP". You take the first seat with your sealed pick
(`open_table`) and the challenge link, `https://near.kova.surf/t/<id>`, is copied for you. The
table also shows it with Copy, "Post on X" and the system share sheet. A friend who opens it sees
the table's stake, round, host and seats, signs in, picks a coin and presses "Join table <id>"
(`join_table`). Seats stay open for 10 minutes. The round starts when the table fills, or when the
host presses "Start now" with two or more seated (`lock_table`); otherwise anyone can refund the
table once seats close and every stake comes back.

After the showdown, the table shows a share card: who won, each pick and its move, and "This pot
burned N CHIP. Supply is now X." "Post on X" opens a prefilled post with the table link,
"Built at NEAR HACKATHON", @NEARProtocol and #NEARHackathon. The link's preview image is drawn
from the contract: the open seat while the table takes players, the result and the burn once it
has settled.

From a terminal: `npm ci` then `npm run prove:near` (see the main README).

Locally: `cd near/chip && cargo test` for the contract (46 unit tests and a sandbox test that
deploys to a local NEAR node), `npm run test:near` for the client, the meme.cooking reader, calls
and scouts.

## Limits

- A settler reports prices and so decides table results.
- The starter claim can be farmed by anyone with many accounts. The treasury is the only cap; blinds
  pull idle farmed chips back.
- Memecoin prices come from thin mainnet pools (tens of thousands of dollars of liquidity, a few
  swaps an hour). A short round on a memecoin usually sees no swap, so it scores 0 and ties are
  common, and a thin pool can be moved. The busy pools (wNEAR, ZEC) move every few seconds.
- A price is the last swap in the pool as DEX Screener reports it, not a time-weighted average.
- Mainnet prices score a game played with a testnet token. CHIP has no value.
- The contract has had no audit.
- The contract account still holds its full-access key, kept by the lead developer. The code has no
  admin methods, but while that key exists it could deploy new code to the account. The token page
  reads the account's keys and shows whether it is still there.
- The mint and burn log on the token page relies on NearBlocks' index; the events themselves are on
  chain either way.
- A "Will it cook?" result is reported by the settler from meme.cooking's mainnet contract, the same
  trust as a price. meme.cooking's contract can be upgraded by its owners, and its index can lag the
  chain by hours (the lobby says so).
- Calls only exist while an auction ends within 14 minutes (the contract's longest round is 15).
  meme.cooking was quiet during the hackathon: on 2026-11-13 one auction was cooking and the last
  launch was on 2026-10-12, so a call depends on an auction ending soon.
- Email sign-in depends on Privy: Privy keeps the wallet, and if Privy is down, email players cannot
  sign in (their game key, already in the browser, still plays). New email accounts are funded by
  Kova's sponsor account, once per login and up to a daily cap; many email logins could still drain
  it within the cap.
- NEAR Auth (formerly FastAuth) was tried first for email sign-in: its shared testnet login accepts
  only `http://localhost:3000` as a callback, so it cannot serve near.kova.surf without its team
  allowing the domain, and its own credentials come only with mainnet production access.
- Clans count a player's clan as of their first table each day. The clan page lists launches by
  the clan's current members, not its members at the time.

## Not built

- Fresh meme.cooking launches joining the picks automatically. None passed the busy-pool rule when
  checked, so the two launches above the liquidity floor are listed by hand.
- "Which of two auctions raises more" races. It needs two auctions cooking at once, which did not
  happen in the window.
- The CHIP contract reading meme.cooking itself. Not possible across testnet and mainnet.
- Team tables.
- Removing the contract account's full-access key (the owner's decision).

## Libraries, templates and AI

- Contract: near-sdk 5.30.1 and near-contract-standards 5.30.1, scaffolded with
  `cargo near new` (cargo-near 0.23.0). Tests: near-sandbox 0.4.0, near-api 0.8.7.
- App: near-api-js 7.4.0, @hot-labs/near-connect 0.12.0, @privy-io/react-auth 3.43.0 (email
  sign-in), Next.js 16, Hono, zod.
- Data: DEX Screener public API (one pinned Rhea pool per coin), NearBlocks API v3, meme.cooking's
  contract `meme-cooking.near` (mainnet, public RPC) and its public index `api.meme.cooking`.
- An AI coding agent (Claude Code) wrote code under the owner's direction, using the NEAR agent
  skills `near-smart-contracts`, `near-api-js` and `near-dapp`.

## Team

The owner and one partner.

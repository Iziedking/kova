# Kova

## NEAR Hackathon entry: Kova, a mine for every memecoin

**Every memecoin gets its own mine. Play a coin and it burns.** A mine is a 5 by 5 grid for one coin. Each UTC minute the mine's contract picks one winning square at random. Coins on the losing squares go to the winners, and **10% of them is burned for good**, so the coin you play is the coin whose supply shrinks. Winners also get fresh CHIP, Kova's own coin.

**Everything here runs on NEAR testnet with coins that have no value. Nothing is deployed to mainnet. There is no audit and no revenue.**

- Live site: **https://near.kova.surf** (NEAR testnet).
- Built at NEAR HACKATHON. Tracks: `memecoins`, `games`.
- Team: Israel Dominic (lead developer: contracts, backend, integration) and Benita Ukachi (frontend, social media posting and the demo).
- Code: the `main` branch of this repository; the submitted state is tag `hackathon-submission`. Design record, every verified fact and every limit: [docs/near/v3/DESIGN.md](docs/near/v3/DESIGN.md). The website and what was tested on it: [docs/near/v3/SITE.md](docs/near/v3/SITE.md).

## The story

Memecoins drive on-chain activity on any chain. People buy, trade, back new launches and open accounts to do it.

But most memecoins follow the same path. The coin launches, the community hypes it for a few days, and then there is nothing left to do. 

NEAR's biggest memecoin launchpad is [meme.cooking](https://meme.cooking). Since 30 September 2024, 971 creators there have started more than 2,300 launch auctions, and 267 coins have launched. meme.cooking's public index shows the pattern: 259 of the 267 launched coins have little to no activity

So we did not build another launchpad. meme.cooking already does that job well. We built Kova for the part that comes after the launch: it gives a memecoin's community something to do together, every minute, and every round burns some of the coin.

### What Kova has

- **A mine for every memecoin.** Each coin gets its own mine at a named account (`<coin>.factory.kova-v3-mwg6hrmb.testnet`), with its own rounds, stake limits and burn.
- **The coin you play is the coin that burns.** 10% of every losing stake is burned in that coin, with the coin's own `ft_burn` (or sent to a keyless address if it has none). Playing a coin shrinks its supply.
- **Mines nobody can change, including us.** The factory opens a mine in one step from one published contract referenced by its code hash, and creates it with **no access keys**. There is no owner and no admin method. `npm run verify:near` checks this on chain.
- **The Foreman**, Kova's own account, with two limited keys (stake CHIP, post) and no full-access key. In any CHIP round a player joins, it puts 1 CHIP on every empty square so the round has a winner, then posts a recap of that round to NEAR's social contract, so each post can be checked on chain. Its stakes and burns are ours, not player activity. Tonight its recaps are plain templates: the AI remark (NEAR AI Cloud) is built and tested against a fake server but no AI key is connected yet.
- **Tied to meme.cooking launches.** The site reads meme.cooking's public mainnet contract and shows what is cooking now. Mines for meme.cooking coins are **planned, not built**: the testnet factory accepts only CHIP and JAMBO. 
- **CHIP**: no premine; minted only by playing (10 a minute across all mines to round winners, halving every 30 days, cap 21,000,000), a shared jackpot called **the Hoard**, and a testnet-only starter claim of 1,000 CHIP.

### How NEAR is used

| NEAR feature | Where Kova uses it |
| --- | --- |
| NEP-141 tokens (`ft_transfer_call`, `ft_on_transfer`, `ft_burn`) | Staking any coin, paying winners, burning 10% |
| NEP-145 storage registration | Registering a mine with its coin so the coin can be sent to it |
| `env::random_seed` | The winning square |
| Global contracts (by code hash) | Every mine runs one published contract; nobody can swap its code |
| Keyless accounts | Mines have no access keys |
| Atomic factory batch | Create the account, fund it, set the code and initialise it in one step, with a refund if any part fails |
| Function-call access keys | The game key (stake CHIP only) and the Foreman's two keys |
| Social DB (`v1.social08.testnet`) | The Foreman's recaps, readable on chain |
| NEAR AI Cloud | The Foreman's AI remark |
| meme.cooking public contract and index | The "cooking now" panel and the coin lists |
| Email wallets (Privy) and NEAR Connect | Sign in without a wallet, or with one |

### What is built

| Piece | What it is |
| --- | --- |
| [`near/mine`](near/mine) | One mine for one coin: the 5x5 grid, the minute rounds, the payout and the 10% burn. No owner, no admin method. |
| [`near/factory`](near/factory) | Opens a mine for an accepted coin in one atomic step, from the published mine code referenced by its hash, with no access keys. |
| [`near/chip-v3`](near/chip-v3) | CHIP and the Hoard. The contract still calls the Hoard `motherlode` in its field and method names (`motherlode_cap`, `motherlode_minted`, ...); the deployed contract is not changed, only the words around it. |
| The site (`/near`) | Landing page with the live CHIP board, the mines, a mine's board, open a mine, the CHIP page, per-mine winners, the Foreman and the "cooking now" panel. |
| The keeper (`npm run keeper:near`) | Settling a round is open to anyone; this small program does it every minute. It runs on our server. |
| The Foreman (`npm run foreman:near`) | Kova's own account. When anyone else stakes in a CHIP round, it covers every empty square with 1 CHIP so the round has a winner, and posts a recap. It does nothing in rounds nobody else plays. |
| `npm run verify:near` | A read-only check of the whole deployment. No keys, no transactions. |

**Testnet deployment** (addresses and hashes: [docs/near/v3/testnet.json](docs/near/v3/testnet.json)):
[factory](https://testnet.nearblocks.io/address/factory.kova-v3-mwg6hrmb.testnet) ·
[CHIP](https://testnet.nearblocks.io/address/chip.kova-v3-mwg6hrmb.testnet) ·
[CHIP mine](https://testnet.nearblocks.io/address/chip-kova-v3-mwg6hrmb-testnet.factory.kova-v3-mwg6hrmb.testnet) ·
[JAMBO mine](https://testnet.nearblocks.io/address/jambo-kova-v3-mwg6hrmb-testnet.factory.kova-v3-mwg6hrmb.testnet) ·
[Foreman](https://testnet.nearblocks.io/address/foreman.kova-v3-mwg6hrmb.testnet).
JAMBO is a second test coin on the same code as CHIP.

**How a round works**
1. Put coins on any of the 25 squares during the minute. Stake in the first 50 seconds: in the CHIP mine the Foreman (our own account) then puts 1 CHIP on every empty square, so the round always has a winner. Your chance of being on the winning square is 1 in 25 for each square you cover.
2. When the minute ends, anyone calls `settle`. The winning square comes from NEAR's random seed, hashed with the mine and the round.
3. If you are on it you get your coins back plus a share of the losing coins, and fresh CHIP. 10% of the losing coins is burned. If nobody is on the winning square, everyone is refunded and nothing burns; without the Foreman, one player on one square sees that 24 times in 25. A round nobody settles within ten minutes can be refunded by anyone, from the site or by calling `refund_round`.

### Check it yourself

1. **Read the chain, no keys needed:** `npm ci`, then `npm run verify:near`. You should see PASS for: the factory's mine code hash, both mines with 0 access keys, both mines running the published hash, the Foreman with no full-access key, CHIP's mint breakdown (nothing outside starter claims, winners and the Hoard), and supply under the cap. INFO lines give the team-held keys, the last rounds and the burn per coin. Output on 14 Nov 2026, 22:10 Lagos:

   ```text
   PASS  The factory opens mines from code hash EdxZggpYrMwBLHvt3RqdmLmvPeZUEh5pRYF7UEoXgmRk (testnet.json: EdxZggpYrMwBLHvt3RqdmLmvPeZUEh5pRYF7UEoXgmRk).
   PASS  The CHIP mine has 0 access keys, so nobody can change it or move its coins.
   PASS  The CHIP mine runs the published code EdxZggpYrMwBLHvt3RqdmLmvPeZUEh5pRYF7UEoXgmRk.
   INFO  CHIP burned by this mine: 725.2 CHIP (25 rounds won, 43 refunded).
   INFO  CHIP round 29911187: square 19 won, 127 paid to 1, 13 burned.
   PASS  The JAMBO mine has 0 access keys, so nobody can change it or move its coins.
   PASS  The JAMBO mine runs the published code EdxZggpYrMwBLHvt3RqdmLmvPeZUEh5pRYF7UEoXgmRk.
   INFO  JAMBO burned by this mine: 147.5 JAMBO (9 rounds won, 24 refunded).
   PASS  The Foreman has 2 keys, 0 with full access.
   INFO  chip.kova-v3-mwg6hrmb.testnet holds 1 access keys (1 full access), held by the team.
   INFO  factory.kova-v3-mwg6hrmb.testnet holds 1 access keys (1 full access), held by the team.
   PASS  CHIP minted 27,206: starter claims 27,000, winners 206, the Hoard 0. Nothing else, so no premine.
   PASS  CHIP supply 26,480.8 of a cap of 21,000,000; 725.2 burned.
   ```
   (Each line also prints its explorer link; shortened here.)
2. **Tests.** `npm test`, `npm run lint` and `npm run typecheck`. On 14 Nov 2026 at 23:00 Lagos the typecheck, the lint and the 109 NEAR tests (`tests/near`) were run on the final code and passed. The full suite (337 tests) last passed on 14 Nov 2026 before the merge ([docs/near/v3/SITE.md](docs/near/v3/SITE.md)).
3. **Contracts.** `cd near/mine && cargo test`, the same in `near/chip-v3` and `near/factory` (53 unit tests; Rust 1.95, see each `rust-toolchain.toml`), and the local-network end-to-end test `cd near/factory && cargo test --test sandbox -- --nocapture` (about 11 minutes). Last recorded passing in [docs/near/v3/DESIGN.md](docs/near/v3/DESIGN.md); not rerun tonight.
4. **Real rounds on testnet:** `PROVE_FUNDER_ACCOUNT=<your funded testnet account> PROVE_FUNDER_KEY_FILE=<path to its key> npm run prove:near`. It creates its own players, plays both mines and prints an explorer link for every transaction. Last full pass: [docs/near/v3/proof-testnet.json](docs/near/v3/proof-testnet.json).
5. **The live site:** open https://near.kova.surf. The CHIP board and its countdown are on the first screen without signing in, with the last round's winning square, what was paid and what burned. To play: "Sign in", then email (Kova creates and funds a testnet account) or a NEAR testnet wallet, turn on the game key once, claim 1,000 CHIP, pick a square and stake. The keeper settles the round a few seconds after the minute ends.
6. **Run it locally:** `npm run dev`, then `http://localhost:3000/near`.

### Limits and threat model

- **No audit.** Treat the contracts as unaudited.
- **Randomness.** The winning square comes from NEAR's random seed for the block that runs `settle`. A validator could time or hold back a `settle` whose result it dislikes. That is why stakes are capped.
- **Stake caps.** Each mine fixes a smallest stake and a most-per-player-per-round when it is opened (for CHIP: 1 to 500 CHIP), and they cannot be changed. The cap bounds what a validator gaming the seed, or one large player, can win in one round.
- **If nobody settles.** For ten minutes after a round ends anyone can settle it; after that it can only be refunded, and anyone can do that, so stakes cannot be trapped. The keeper is a convenience, not a requirement: the site has a Settle button (and a Refund button for an old round) for any signed-in player with about 0.15 NEAR free.
- **Keys the team still holds.** The mines have no keys. `chip.kova-v3-mwg6hrmb.testnet` and `factory.kova-v3-mwg6hrmb.testnet` each still hold one full-access key held by the team. Neither contract has an admin method, but a full-access key can redeploy the contract on that account. `npm run verify:near` prints how many keys each holds.
- **The Foreman is ours.** Its stakes, wins and burns are the team's own account, not player demand. The site's totals include them and say so. It covers squares only in rounds a player joins, costs about 0.02 testnet NEAR per such round in gas, and stops when its NEAR or CHIP runs low; then a lone player's round is refunded 24 times in 25 again. It does not play JAMBO (its key can only stake CHIP), so a lone JAMBO player is usually refunded.
- **Only CHIP can be staked without wallet pop-ups.** Any other coin is a normal token transfer that needs a confirmation each time.
- **Mainnet is not deployed.** Publishing the mine code on mainnet alone burns about 21 NEAR; it is a separate decision.
- **Not run yet:** wallet-extension sign-in on the live site, and a mine for a new coin launched on meme.cooking.

### Prior art and what Kova adds

The grid-and-minute round was first done by [ORE](https://ore.supply) on Solana. Kova adds: a mine for every memecoin, opened by anyone from published code fixed by its hash, with no keys; the burn in the coin being played, so playing a coin shrinks its supply; named accounts per mine; CHIP, earned only by playing; the Foreman, which plays and posts each recap on chain with two limited keys; and the tie to meme.cooking launches. No ORE code is used: the contracts are written for NEAR in Rust with near-sdk. The round design, the jackpot odds of 1 in 625, the 10% cut of losing stakes and the auto-mine idea follow ORE; the jackpot's contract field name (`motherlode`) is ORE's word, kept only because the deployed contract cannot be renamed.

### Path to revenue (planned, not built)

**Today Kova charges nothing and earns nothing.** All of the 0.2 NEAR an opener pays goes into the new mine to run on, and the whole 10% of losing coins goes to the burn. No fee exists in any contract. The plan: an opening fee in a new factory version; a 1 to 2% protocol fee on losing stakes in a new mine version, fixed in code and shown before anyone stakes; and one treasury account both partners control, published here. No part of CHIP's newly minted coins will ever go to the team. None of this is built, because it changes the contracts, and no revenue is claimed anywhere in this project.

### Earlier work and disclosure

- **Kova already existed on Solana devnet before the hackathon** (everything up to tag `pre-hackathon`). Only the NEAR work was built in the hackathon window: [the diff](https://github.com/Iziedking/kova/compare/pre-hackathon...hackathon-submission).
- **The poker version of Kova on NEAR** (CHIP v2, `kova-chip.testnet`, [`near/chip`](near/chip)) is earlier hackathon work. It is still in the history and the code, its pages are hidden on the site, and it is no longer the entry.
- The same developer also entered **Splits** (https://github.com/Iziedking/splits). The two projects are independent: different products, repos, contracts and accounts.
- **Libraries and AI-generated code.** Built with Next.js, React, Tailwind CSS, near-api-js, near-sdk (Rust), Privy, zod and lucide-react (full list in `package.json` and each contract's `Cargo.toml`). Much of the code and text was written with AI coding assistants and reviewed by the team.
- **The earlier project's README** (before the hackathon) is kept at [docs/earlier-project.md](docs/earlier-project.md).

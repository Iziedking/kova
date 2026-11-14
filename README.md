# Kova

**A mining game for NEAR memecoins. One square wins every minute.**

Built at NEAR HACKATHON. Tracks: `memecoins` (Memecoins With Mechanics), `games`, `agents`. Runs on NEAR testnet with coins that have no value. Nothing is deployed to mainnet.

## The idea

A memecoin launch is a burst of activity on NEAR. Backers deposit, the coin is created, a trading pool opens.

NEAR has a launchpad for this, [meme.cooking](https://meme.cooking). Since 30 September 2024, 971 creators there have started more than 2,300 launch auctions. 267 coins have launched, backers deposited about 200,000 NEAR across them, and each launched coin got its own pool. (Numbers read from meme.cooking's public index, `api.meme.cooking/meme`, on 14 Nov 2026.)

Launching gets a coin started. Kova asks what its holders can do together after that, every minute.

Kova does not launch coins. meme.cooking does that. Kova works with the coins it launches. Each coin gets its own mine: a 5 by 5 grid with a new round every minute. Holders put the coin on a square, the contract picks a winning square at random, and the coins on the losing squares go to the winners. 10% of the losing coins is burned. The coin gets steady activity, and a little less supply every round.

Kova is not affiliated with meme.cooking. It reads their public mainnet contract and index. Mines for meme.cooking coins on mainnet are planned, not built; today Kova runs on testnet with two test coins, CHIP and JAMBO.

## What Kova is

- Every coin gets its own mine, opened by anyone through a factory contract, with no permission from us.
- The winning square comes from NEAR's random seed. Kova does not choose it.
- Winners also get fresh CHIP, Kova's own coin. No premine: CHIP is only minted by winning rounds.
- Mines have **no access keys**, so nobody, including us, can change them or move their coins. The site checks this live.
- **The Foreman** is an AI agent that mines beside you and posts a recap of every round on chain. It is powered by NEAR AI Cloud, with BRRRAIN as backup. Its keys can only stake CHIP and post.

## How NEAR is used

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
| NEAR AI Cloud | The Foreman's commentary (BRRRAIN as backup) |
| meme.cooking public contract and index | The "cooking now" panel and the coin lists |
| Email wallets (Privy) and NEAR Connect | Sign in without a wallet, or with one |

## What is built

| Piece | What it is |
| --- | --- |
| [`near/mine`](near/mine) | One mine for one coin: the 5x5 grid, the minute rounds, the payout and the 10% burn. No owner, no admin method. |
| [`near/factory`](near/factory) | Opens a mine for an accepted coin, in one atomic step, from one published contract referenced **by its code hash** (so nobody can change what a mine runs). Each mine is created with **no access keys**. |
| [`near/chip-v3`](near/chip-v3) | CHIP: no premine; minted only by winning rounds (10 a minute across all mines, halving every 30 days, cap 21,000,000), a jackpot (the Motherlode), and a testnet-only starter claim. |
| The site (`/near`) | Landing page, live mines, a mine's board, open a mine, the CHIP page, a leaderboard, the Foreman and a "cooking now" panel that reads meme.cooking. |
| The keeper (`npm run keeper:near`) | Anyone can finish a round; this small program does it, and it records every round for the global leaderboard (who staked, won and burned, per coin). |
| The Foreman (`npm run foreman:near`) | **An AI agent powered by NEAR AI Cloud, with BRRRAIN as its backup** that plays beside you with a fixed rule and posts a recap of every round to NEAR's social contract, so each post can be checked on chain. The facts in a recap come from the chain; the AI adds the commentary. Its account has two limited keys and **no full-access key**. The site shows an "AI status: live" line only when a recap really carries an AI remark. |

**Testnet deployment** (addresses and hashes: [docs/near/v3/testnet.json](docs/near/v3/testnet.json)):
[factory](https://testnet.nearblocks.io/address/factory.kova-v3-mwg6hrmb.testnet) ·
[CHIP](https://testnet.nearblocks.io/address/chip.kova-v3-mwg6hrmb.testnet) ·
[CHIP mine](https://testnet.nearblocks.io/address/chip-kova-v3-mwg6hrmb-testnet.factory.kova-v3-mwg6hrmb.testnet) ·
[JAMBO mine](https://testnet.nearblocks.io/address/jambo-kova-v3-mwg6hrmb-testnet.factory.kova-v3-mwg6hrmb.testnet) ·
[Foreman](https://testnet.nearblocks.io/address/foreman.kova-v3-mwg6hrmb.testnet).
JAMBO is a second test coin on the same code as CHIP. The site's CHIP page reads the mines' access keys from the chain and shows that they have none.

### How a round works
1. Put coins on any of the 25 squares during the minute.
2. When the minute ends, anyone calls `settle`. The winning square comes from NEAR's own random seed, hashed with the mine and the round.
3. If you are on it you get your coins back plus a share of the losing coins, and fresh CHIP. 10% of the losing coins is burned (with the coin's own `ft_burn`, or sent to a keyless address if it has none). If nobody is on the winning square, everyone is refunded and nothing burns. A round nobody settles within ten minutes can be refunded by anyone.

## Try it

1. Run `npm ci`. See: dependencies install.
2. Run `npm test`, then `npm run lint && npm run typecheck`. See: all pass.
3. Contracts: `cd near/mine && cargo test`, the same in `near/chip-v3` and `near/factory` (53 unit tests; Rust 1.95, see each `rust-toolchain.toml`). The end-to-end test on a local NEAR network is `cd near/factory && cargo test --test sandbox -- --nocapture` (about 11 minutes). See: all tests pass.
4. Play real rounds on testnet and check every unit: `PROVE_FUNDER_ACCOUNT=<your funded testnet account> PROVE_FUNDER_KEY_FILE=<path to its key> npm run prove:near`. It uses our deployed mines, creates its own players, and prints an explorer link for every transaction. See: rounds settle with exact payouts and a 10% burn. (Without a funder it asks the testnet faucet, which rate-limits.)
5. Check the Foreman's AI keys: `npm run ai:check` (add `-- --call` for one real sentence). Key files go outside the repo; see [docs/near/v3/HANDOVER.md](docs/near/v3/HANDOVER.md).
6. Run `npm run dev`, then open `http://localhost:3000/near`. See: a live CHIP grid with a minute timer, the mines list, and the CHIP page checking the mines' access keys.

## Path to revenue (planned, not built)

**Today Kova charges nothing and earns nothing.** All of the 0.2 NEAR an opener pays goes into the new mine to
run on, and the whole 10% of losing coins goes to the burn. No fee exists in any contract. What follows is the
plan, written down so it is clear from the start that this is meant to be a real product, not a claim about what
is live.

1. **An opening fee.** Part of what an opener pays goes to a treasury account instead of all of it going into the
   mine. This changes only the factory (a new factory version); the mine code stays as it is. The amount is fixed
   in the factory's code and shown on the Open page before anyone pays.
2. **A small protocol fee on losing stakes.** About 1 to 2% of each settled round's losing stakes, taken in the
   staked coin and sent to the treasury, on top of the 10% burn. It is fixed in the mine's code, so nobody can raise
   it later, and shown on the mine page before anyone stakes. This needs a new mine version.
3. **A treasury both partners control.** One NEAR account, published in this README, so where the money goes can be
   checked on chain. The split between the two partners is the team's decision.

**Rules we are setting for ourselves:** no part of CHIP's newly minted coins ever goes to the team, because "no
premine, every CHIP is earned by playing" is the point of CHIP; every fee is in the code, visible before you play,
and cannot be changed by anyone; the burn stays the headline.

**Why it is not built yet:** the protocol fee changes the mine contract, which means a new published code hash, a full
retest (the unit tests, the local-network end-to-end test and the testnet proof), and a new publish (about 21 NEAR on
testnet, and the same on mainnet). That is not a safe change to make on the last day, so no revenue is claimed
anywhere in this project.

## What is not done

- **No audit.** Treat the contracts as unaudited.
- **Mainnet is not deployed.** A mainnet launch is a separate decision that costs real NEAR (publishing the mine code alone burns about 21 NEAR).
- **The random number can be nudged in theory.** The winner comes from NEAR's random seed; a validator could decline to include a `settle` whose result it dislikes. Keep stakes small. Someone must also call `settle`; the keeper does.
- **On testnet, CHIP and the factory accounts still hold a key** (the mines do not). They are meant to be locked at the end; until then the "no admin key" claim holds for the mines only.
- **Only CHIP can be staked without wallet pop-ups.** Any other coin is a normal token transfer that needs a confirmation each time.
- **Email sign-in** (Privy) was not run on the new site. **The Foreman's AI keys (NEAR AI Cloud first, BRRRAIN as backup) are not connected in this repository's test deployment yet**: the AI path is built and tested against a fake server, `npm run ai:check` verifies real keys, and until keys are connected every recap is a template, and the site shows the "AI status: live" line only when a recap really carries an AI remark.
- **Kova reads meme.cooking's public mainnet contract and index; it is not affiliated with meme.cooking.** A mine for a launched meme.cooking coin is built and tested up to the last step but has not been run on a real new coin: the testnet factory only accepts CHIP and JAMBO.
- The original poker-style Kova on NEAR (CHIP v2, `kova-chip.testnet`) is kept in the repository ([`near/chip`](near/chip)) and hidden on the site by default (`KOVA_NEAR_CLASSIC=true` shows it).

## Disclosure

- **Existing project.** Kova existed before the hackathon as a game on another chain (everything up to tag `pre-hackathon`). Only the NEAR work was built in the hackathon window: [the diff](https://github.com/Iziedking/kova/compare/pre-hackathon...kova-v3), on branch `kova-v3`. The earlier project's README is kept at [docs/earlier-project.md](docs/earlier-project.md).
- **Idea.** The grid game is inspired by [ORE](https://ore.supply).
- **AI-assisted code.** Much of the code was written with an AI coding assistant (Claude Code).
- **Libraries.** near-sdk 5.30.1 (Rust contracts), near-api-js 7, Next.js 16, Tailwind 4, zod, Privy. Our own libraries from before the hackathon count as baseline.
- **Other project.** The same developer also entered **Splits** (https://github.com/Iziedking/splits). The two projects are independent: different products, repos, contracts and accounts.
- **License.** See [LICENSE](LICENSE).

## Team

Israel Dominic (lead developer: contracts, backend, integration) and Benita Ukachi (frontend, social media and the demo).

Design record, every verified fact and every limit: [docs/near/v3/DESIGN.md](docs/near/v3/DESIGN.md). The website and what was tested on it: [docs/near/v3/SITE.md](docs/near/v3/SITE.md). What is left to do: [docs/near/v3/HANDOVER.md](docs/near/v3/HANDOVER.md).

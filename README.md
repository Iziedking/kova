# KOVA

## NEAR Hackathon entry: Kova, a mine for every memecoin

**Every memecoin gets its own mine. Play a coin and it burns.** A mine is a 5 by 5 grid for one coin. Each UTC minute the mine's contract picks one winning square at random. Coins on the losing squares go to the winners, and **10% of them is burned for good**, so the coin you play is the coin whose supply shrinks. Winners also get fresh CHIP, Kova's own coin.

**Everything here runs on NEAR testnet with coins that have no value. Nothing is deployed to mainnet. There is no audit and no revenue.**

- Live site: **https://near.kova.surf** (NEAR testnet).
- Built at NEAR HACKATHON. Tracks: `memecoins`, `games`.
- Team: Israel Dominic (lead developer: contracts, backend, integration) and Benita Ukachi (frontend, social media posting and the demo).
- Code: the `main` branch of this repository; the submitted state is tag `hackathon-submission`. Design record, every verified fact and every limit: [docs/near/v3/DESIGN.md](docs/near/v3/DESIGN.md). The website and what was tested on it: [docs/near/v3/SITE.md](docs/near/v3/SITE.md).

### What Kova has

- **A mine for every memecoin.** Each coin gets its own mine at a named account (`<coin>.factory.kova-v3-mwg6hrmb.testnet`), with its own rounds, stake limits and burn.
- **The coin you play is the coin that burns.** 10% of every losing stake is burned in that coin, with the coin's own `ft_burn` (or sent to a keyless address if it has none). Playing a coin shrinks its supply.
- **Mines nobody can change, including us.** The factory opens a mine in one step from one published contract referenced by its code hash, and creates it with **no access keys**. There is no owner and no admin method. `npm run verify:near` checks this on chain.
- **The Foreman**, an agent account with two limited keys (stake CHIP, post) and no full-access key. It plays beside you and posts a recap of every round to NEAR's social contract, so each post can be checked on chain. Tonight its recaps are plain templates: the AI remark (NEAR AI Cloud) is built and tested against a fake server but no AI key is connected yet.
- **Tied to meme.cooking launches.** The site reads meme.cooking's public mainnet contract and shows what is cooking now. Mines for meme.cooking coins are **planned, not built**: the testnet factory accepts only CHIP and JAMBO. Kova is not affiliated with meme.cooking.
- **CHIP**: no premine; minted only by playing (10 a minute across all mines to round winners, halving every 30 days, cap 21,000,000), a shared jackpot called **the Hoard**, and a testnet-only starter claim of 1,000 CHIP.

### What is built

| Piece | What it is |
| --- | --- |
| [`near/mine`](near/mine) | One mine for one coin: the 5x5 grid, the minute rounds, the payout and the 10% burn. No owner, no admin method. |
| [`near/factory`](near/factory) | Opens a mine for an accepted coin in one atomic step, from the published mine code referenced by its hash, with no access keys. |
| [`near/chip-v3`](near/chip-v3) | CHIP and the Hoard. The contract still calls the Hoard `motherlode` in its field and method names (`motherlode_cap`, `motherlode_minted`, ...); the deployed contract is not changed, only the words around it. |
| The site (`/near`) | Landing page with the live CHIP board, the mines, a mine's board, open a mine, the CHIP page, per-mine winners, the Foreman and the "cooking now" panel. |
| The keeper (`npm run keeper:near`) | Settling a round is open to anyone; this small program does it every minute. It runs on our server. |
| The Foreman (`npm run foreman:near`) | Plays two squares a round with a fixed rule and posts a recap on chain. |
| `npm run verify:near` | A read-only check of the whole deployment. No keys, no transactions. |

**Testnet deployment** (addresses and hashes: [docs/near/v3/testnet.json](docs/near/v3/testnet.json)):
[factory](https://testnet.nearblocks.io/address/factory.kova-v3-mwg6hrmb.testnet) ·
[CHIP](https://testnet.nearblocks.io/address/chip.kova-v3-mwg6hrmb.testnet) ·
[CHIP mine](https://testnet.nearblocks.io/address/chip-kova-v3-mwg6hrmb-testnet.factory.kova-v3-mwg6hrmb.testnet) ·
[JAMBO mine](https://testnet.nearblocks.io/address/jambo-kova-v3-mwg6hrmb-testnet.factory.kova-v3-mwg6hrmb.testnet) ·
[Foreman](https://testnet.nearblocks.io/address/foreman.kova-v3-mwg6hrmb.testnet).
JAMBO is a second test coin on the same code as CHIP.

**How a round works**
1. Put coins on any of the 25 squares during the minute.
2. When the minute ends, anyone calls `settle`. The winning square comes from NEAR's random seed, hashed with the mine and the round.
3. If you are on it you get your coins back plus a share of the losing coins, and fresh CHIP. 10% of the losing coins is burned. If nobody is on the winning square, everyone is refunded and nothing burns. A round nobody settles within ten minutes can be refunded by anyone, from the site or by calling `refund_round`.

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
2. **Tests.** `npm test`, `npm run lint` and `npm run typecheck`. On 14 Nov 2026 the typecheck, the lint and the 57 NEAR tests were run again and passed. The full suite (337 tests) last passed on 14 Nov 2026 before the merge ([docs/near/v3/SITE.md](docs/near/v3/SITE.md)).
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
---

KOVA is a multiplayer prediction game for Solana stock-themed meme tokens. Each player secretly picks a token, everyone stakes the same amount of ANSEM into an on-chain escrow, and the pick with the best price move over the round takes the pot.

An AI Dealer, running as a ClawPump agent, reviews every submitted token before it can enter. It decides whether the exact mint is a stock-themed meme (GME, NVDA and similar narratives) or should be kept out. The Dealer never picks, prices, scores or pays. A Solana program holds the stakes, checks the result and pays the winner, and every table becomes refundable on its own if anything stalls.

Players can also send AI agents to play for them, and KOVA runs its own trading agent, the House, so there is always someone to play against. See [docs/ai-agents.md](docs/ai-agents.md).

- App: https://kova.surf
- API: https://api.kova.surf
- Built for the [AnsemHack Clawrena](https://clawpump.tech/ansemhack)

## Status

KOVA runs on **Solana devnet** with a valueless TEST ANSEM token. Mainnet play is not enabled.

| Capability | State |
| --- | --- |
| Escrow program | Deployed to devnet, `AJeX3fo46PTu6StNorvkSatRwXLKAvfZpDv6PAzJVCjj` |
| Stake token | TEST ANSEM `9URYxr92ouua9h1vwWdFetUwrQj4WVcGyRcbSmVN14nA` (devnet, no value) |
| Dealer admission | Live through the ClawPump partner API |
| Private picks, deposits, settlement, claims, refunds | Live on devnet |
| Mainnet ANSEM stakes | Not enabled. See [docs/release-status.md](docs/release-status.md) |
| Trade mode | Live on devnet: live DEX prices, simulated fills, real TEST ANSEM stakes. See [docs/trading-mode.md](docs/trading-mode.md) |
| Dealer desk | Live: every verdict with its reasons at [kova.surf/dealer](https://kova.surf/dealer), and a plain-text feed for X |
| Player agents | Live on devnet: GET-only agent API, KOVA-held vaults, server-side risk limits. See [docs/ai-agents.md](docs/ai-agents.md) |
| The House | Live on devnet: keeps a "Beat the House" table open, decides with a ClawPump agent. See [docs/ai-agents.md](docs/ai-agents.md#the-house) |
| Points and referrals | Live: Season 1 points for staked games and invites. No cash value. See [docs/economics.md](docs/economics.md) |
| Revenue | Not enabled. The mainnet program adds a pot fee to a treasury. See [docs/economics.md](docs/economics.md) |

## How a round works

1. A host creates a table with a stake (up to 10 ANSEM), seat count and round length (5 to 15 minutes). It waits as a lobby for up to 24 hours while players join. The first stake opens it on chain, and the program then gives everyone ten minutes to stake.
2. A player proves wallet ownership with a signed message, then types a ticker or contract address. The Dealer reviews that exact token.
3. If the Dealer accepts, the pick is committed privately. Only a SHA-256 commitment goes on chain; the token itself is stored encrypted on the server.
4. The backend co-signs the deposit only for an accepted pick. The player's wallet signs and sends it, and the backend records the seat as funded only after reading the escrow entry back from chain.
5. When every seat is funded, a worker locks the table, captures each pick's price at the same moment, records the starts on chain and activates the round.
6. At the end the worker captures closing prices and finalizes. The program recomputes every score, checks the start digest and roster order, and splits the pot between the best signed return (ties split, with remainder units assigned by wallet byte order).
7. Picks are revealed at the showdown. The winner claims from escrow with their own wallet.

If the backend stops at any point, the program's deadlines make the table refundable, and anyone can trigger the refund.

## Agents

- **The Dealer's record** is public at [kova.surf/dealer](https://kova.surf/dealer): how many tokens it has judged, its admit rate and confidence, and each verdict with its reasons. A refusal shows at once. An admitted pick shows only after its table ends, so the desk never gives away a live pick. `/api/game/dealer/feed` serves the same record as plain text for a ClawPump agent to post to X.
- **Player agents** play for their owners. A player creates one at [kova.surf/agents](https://kova.surf/agents) and gets a key and a devnet vault with 10 TEST ANSEM. The agent plays through GET requests (`/api/agent/v1/...`), because a ClawPump agent's web tool can only fetch URLs. Any agent that can make HTTP requests can use the same API. KOVA caps every agent at 2 ANSEM a table, 2 open tables, 12 seats a day and orders of 25% of match equity.
- **The House** (`kova_house`) keeps a "Beat the House" Trade table open and takes a seat wherever a player is waiting. A ClawPump agent decides its trades; KOVA applies a -3% stop-loss, caps orders at 20% of equity and exposure at 60%, and stops it for the day after a 3 ANSEM loss. Its matches, stakes and reasoning are public at [kova.surf/house](https://kova.surf/house), with each decision shown after its match ends.

## Points and revenue

Players earn Season 1 points for every staked game that settles (+10), for wins (+25) and for inviting friends who play (+100 to the inviter, +50 to the friend). Links look like `kova.surf/?ref=<username>`. Agents earn nothing. Points have no cash value today; the plan is to fund future seasons from a mainnet pot fee paid to a KOVA treasury. Details and the proposed conversion rules are in [docs/economics.md](docs/economics.md).

On devnet, two agents have played a full Trade match against each other with no human involved, and the House has played a challenger agent, with every stake, settlement and claim on chain. The scripts are in `scripts/devnet`.

## Repository layout

| Path | Contents |
| --- | --- |
| `programs/kova_game` | Anchor escrow program: tables, entries, starts, results, payouts, refunds |
| `idl/` | Reviewed program IDL and TypeScript type |
| `src/domain` | Pure game rules: amounts, commitments, scoring, state, API schemas |
| `src/adapters/game` | Program client, ClawPump client, DEX Screener and GeckoTerminal market data, Solana reads |
| `src/application/game` | Dealer admission and its deterministic gate |
| `src/backend` | Hono API, PostgreSQL repository and migrations, settlement worker, agent API, Dealer desk, House trader |
| `src/app`, `src/features`, `src/components`, `src/services` | Next.js frontend |
| `scripts/devnet` | Devnet setup, Dealer probe and end-to-end proofs |
| `scripts/program` | Program build and local validator |
| `deploy/` | Backend Dockerfile, Compose recipe, ingress block, VM deploy script |
| `tests/` | Unit, adversarial, API and deployment tests |
| `docs/` | Protocol, program, Dealer, worker, frontend and operations notes |

`src/app/legacy` and some `src/domain`/`src/adapters` modules come from FLOAT, the liquidity product this repository started as. They are kept for reference and are not part of KOVA.

## Development

Node.js 24 and the committed lockfile:

```bash
npm ci
npm run dev           # frontend with sample data
npm run backend:dev   # API on http://127.0.0.1:8787
npm run check         # typecheck, lint, tests, proofs, build, client-bundle secret scan
npm run test:postgres-game   # real PostgreSQL race and migration tests (needs Docker)
```

The backend runs without credentials in preview mode. The full game needs PostgreSQL, Privy, a pick-encryption key, the stake mint, a Solana RPC, three signing key files and, for the Dealer, ClawPump credentials. Every variable is listed without values in [.env.example](.env.example).

Program builds use a pinned Linux toolchain (Anchor 1.2.0, Solana 4.1.2, Rust 1.91). See [docs/program.md](docs/program.md). Devnet setup and the end-to-end proofs are in [docs/devnet.md](docs/devnet.md).

## Deployment

A push to `main` deploys both halves. Vercel builds the frontend. GitHub Actions runs every check, then deploys that exact commit to the API server, which rolls back on a failed health check. See [docs/cicd.md](docs/cicd.md).

## Documentation

- [docs/game-api.md](docs/game-api.md): HTTP routes, commitments, arithmetic
- [docs/program.md](docs/program.md): escrow program rules and build
- [docs/dealer.md](docs/dealer.md): Dealer contract, gate and isolation limits
- [docs/ai-agents.md](docs/ai-agents.md): the Dealer desk and X feed, player agents and their API, the House
- [docs/economics.md](docs/economics.md): points, referrals and the proposed revenue model
- [docs/worker.md](docs/worker.md): settlement worker and recovery
- [docs/frontend.md](docs/frontend.md): routes, service seam, wallet signing
- [docs/devnet.md](docs/devnet.md): devnet deployment and proofs
- [docs/cicd.md](docs/cicd.md): CI/CD and rollback
- [docs/release-status.md](docs/release-status.md): what remains before mainnet
- [docs/trading-mode.md](docs/trading-mode.md): the guarded trading slice
- [CONTRIBUTING.md](CONTRIBUTING.md): how to contribute

## Known limits

- Prices are DEX Screener marks with no source timestamp. Anyone who can move a thin market during a round can move a score.
- The Dealer's ClawPump agent keeps always-on skills that cannot be switched off. KOVA sends it no tools and voids any run that reports one, and its wallet holds nothing, but the isolation is enforced by KOVA rather than by ClawPump.
- Agent vaults are custodial: KOVA holds their keys. That is acceptable for valueless TEST ANSEM, and agents on mainnet would need another model.
- The escrow program has not had an independent audit.
- Legal availability of paid play has not been reviewed.

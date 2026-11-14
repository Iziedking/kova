# KOVA

## NEAR Hackathon entry: Kova, a mining game for memecoins

**Put your memecoin on a square. Every minute, one square wins.** Every coin gets its own mine: a 5 by 5 grid. Each UTC minute the mine's contract picks one winning square at random. Coins on the losing squares go to the winners, and **10% of them is burned for good**. Winners also get fresh CHIP, Kova's own coin. The more people play a coin, the less of it is left.

**Everything here runs on NEAR testnet with coins that have no value. Nothing is deployed to mainnet.**

- Built for NEAR Hackathon. Tracks: `memecoins`, `games`.
- **The idea comes from [ORE](https://ore.supply), a mining game on Solana.** Kova's grid is based on it, rebuilt on NEAR so that every NEAR memecoin can have its own mine.
- Team: Israel Dominic (lead developer: contracts, backend, integration) and Benita Ukachi (frontend, social media posting and the demo).
- Code: this branch, `kova-v3`. Design record, every verified fact and every limit: [docs/near/v3/DESIGN.md](docs/near/v3/DESIGN.md). The website and what was tested on it: [docs/near/v3/SITE.md](docs/near/v3/SITE.md).

### What is built

| Piece | What it is |
| --- | --- |
| [`near/mine`](near/mine) | One mine for one coin: the 5x5 grid, the minute rounds, the payout and the 10% burn. No owner, no admin method. |
| [`near/factory`](near/factory) | Opens a mine for an accepted coin, in one atomic step, from one published contract referenced **by its code hash** (so nobody can change what a mine runs). Each mine is created with **no access keys**. |
| [`near/chip-v3`](near/chip-v3) | CHIP: no premine; minted only by winning rounds (10 a minute across all mines, halving every 30 days, cap 21,000,000), a jackpot (the Motherlode), and a testnet-only starter claim. |
| The site (`/near`) | Landing page, live mines, a mine's board, open a mine, the CHIP page, a leaderboard, the Foreman and a "cooking now" panel that reads meme.cooking. |
| The keeper (`npm run keeper:near`) | Anyone can finish a round; this small program does it, and it records every round for the global leaderboard (who staked, won and burned, per coin). |
| The Foreman (`npm run foreman:near`) | **An AI agent powered by BRRRAIN and NEAR AI Cloud** that plays beside you with a fixed rule and posts a recap of every round to NEAR's social contract, so each post can be checked on chain. The facts in a recap come from the chain; the AI adds the commentary. Its account has two limited keys and **no full-access key**. The site shows a live "AI status" line. |

**Testnet deployment** (addresses and hashes: [docs/near/v3/testnet.json](docs/near/v3/testnet.json)):
[factory](https://testnet.nearblocks.io/address/factory.kova-v3-mwg6hrmb.testnet) ·
[CHIP](https://testnet.nearblocks.io/address/chip.kova-v3-mwg6hrmb.testnet) ·
[CHIP mine](https://testnet.nearblocks.io/address/chip-kova-v3-mwg6hrmb-testnet.factory.kova-v3-mwg6hrmb.testnet) ·
[JAMBO mine](https://testnet.nearblocks.io/address/jambo-kova-v3-mwg6hrmb-testnet.factory.kova-v3-mwg6hrmb.testnet) ·
[Foreman](https://testnet.nearblocks.io/address/foreman.kova-v3-mwg6hrmb.testnet).
JAMBO is a second test coin on the same code as CHIP. The site's CHIP page reads the mines' access keys from the chain and shows that they have none.

**How a round works**
1. Put coins on any of the 25 squares during the minute.
2. When the minute ends, anyone calls `settle`. The winning square comes from NEAR's own random seed, hashed with the mine and the round.
3. If you are on it you get your coins back plus a share of the losing coins, and fresh CHIP. 10% of the losing coins is burned (with the coin's own `ft_burn`, or sent to a keyless address if it has none). If nobody is on the winning square, everyone is refunded and nothing burns. A round nobody settles within ten minutes can be refunded by anyone.

### Try it

1. `npm ci`
2. `npm test` (all tests) and `npm run lint && npm run typecheck`.
3. Contracts: `cd near/mine && cargo test`, the same in `near/chip-v3` and `near/factory` (53 unit tests; Rust 1.95, see each `rust-toolchain.toml`). The end-to-end test on a local NEAR network is `cd near/factory && cargo test --test sandbox -- --nocapture` (about 11 minutes).
4. Play real rounds on testnet and check every unit: `PROVE_FUNDER_ACCOUNT=<your funded testnet account> PROVE_FUNDER_KEY_FILE=<path to its key> npm run prove:near`. It uses our deployed mines, creates its own players, and prints an explorer link for every transaction. (Without a funder it asks the testnet faucet, which rate-limits.)
5. Check the Foreman's AI keys: `npm run ai:check` (add `-- --call` for one real sentence). Key files go outside the repo; see [docs/near/v3/HANDOVER.md](docs/near/v3/HANDOVER.md).
6. The site: `npm run dev`, then open `http://localhost:3000/near`.

### Path to revenue (planned, not built)

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

### What is not done, said plainly

- **No audit.** Treat the contracts as unaudited.
- **Mainnet is not deployed.** A mainnet launch is a separate decision that costs real NEAR (publishing the mine code alone burns about 21 NEAR).
- **The random number can be nudged in theory.** The winner comes from NEAR's random seed; a validator could decline to include a `settle` whose result it dislikes. Keep stakes small. Someone must also call `settle`; the keeper does.
- **On testnet, CHIP and the factory accounts still hold a key** (the mines do not). They are meant to be locked at the end; until then the "no admin key" claim holds for the mines only.
- **Only CHIP can be staked without wallet pop-ups.** Any other coin is a normal token transfer that needs a confirmation each time.
- **Email sign-in** (Privy) was not run on the new site. **The Foreman's AI keys (BRRRAIN and NEAR AI Cloud) are not connected in this repository's test deployment yet**: the AI path is built and tested against a fake server, `npm run ai:check` verifies real keys, and until keys are connected every recap is a template and the site's "AI status" line says so.
- **Kova reads meme.cooking's public mainnet contract and index; it is not affiliated with meme.cooking.** A mine for a launched meme.cooking coin is built and tested up to the last step but has not been run on a real new coin: the testnet factory only accepts CHIP and JAMBO.
- The original poker-style Kova on NEAR (CHIP v2, `kova-chip.testnet`) is kept at `/near/classic` and in [`near/chip`](near/chip).

**Disclosure.** Kova already existed on Solana devnet before the hackathon (everything up to tag `pre-hackathon`). Only the NEAR work was built in the hackathon window: [the diff](https://github.com/Iziedking/kova/compare/pre-hackathon...kova-v3). The same developer also entered **Splits** (https://github.com/Iziedking/splits). The two projects are independent: different products, repos, contracts and accounts.

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

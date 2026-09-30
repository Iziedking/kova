# KOVA

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
| The House | Built and proven on devnet; runs when `KOVA_HOUSE_ENABLED=true`. See [docs/ai-agents.md](docs/ai-agents.md#the-house) |

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

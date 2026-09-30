# Points and revenue

Points and referrals are live on devnet. The revenue model below is the plan for mainnet: none of it takes money today, and the escrow program currently pays the whole pot to the winners.

## Points (live, Season 1)

Points are an off-chain record with no cash value. A future season may convert them to rewards.

| Action | Points |
| --- | --- |
| A staked game you played settles | +10 |
| You won it (payout above your stake) | +25 more |
| A friend you invited finishes their first staked game | +100 to you |
| You joined through a friend's invite and finished your first staked game | +50 to you |

A referral link is `https://kova.surf/?ref=<username>`. KOVA stores the code when the link is opened and records the invite after sign-in, provided the new player hasn't taken a seat yet, isn't the inviter, and hasn't been invited already.

The ledger is derived from settled games. `PointsService.sync()` runs every minute, and a unique key on (player, kind, table or referee) stops any award from landing twice, so the whole ledger can be rebuilt from game history. AI agents and the House earn no points, and a draw returns the stake without counting as a win. Two accounts one person controls can still play each other for points on devnet, where stakes are TEST ANSEM, so any conversion to rewards needs eligibility checks first (see below).

Routes: `GET /api/game/points/me`, `GET /api/game/points/leaderboard`, `POST /api/game/referrals/claim`. The player page is [kova.surf/points](https://kova.surf/points).

## Revenue (proposed, mainnet)

1. **Pot fee.** The mainnet program rebuild, which already has to pin the ANSEM mint, adds a fee on settled pots, proposed at 3%, paid to a KOVA treasury account by the program itself, so every fee is visible on chain. Refunds and draws return stakes in full with no fee.
2. **Sponsored tables.** A project pays to feature its stock-themed token in a sponsored Predict table or lobby. The Dealer still has to admit the token; a sponsor can't buy its way past the Dealer.
3. **Agent plans.** Player agents stay free within today's limits. A paid plan would raise them: more agents, higher stakes per table. This needs a non-custodial agent model before mainnet (see [ai-agents.md](ai-agents.md)).
4. **Token fees.** If KOVA launches a token on ClawPump, its creator fees go to the same treasury.

## Converting points to rewards (proposed)

At the end of a season, a fixed share of that season's treasury income would be split across players in proportion to their points. Before any conversion:

- one reward per person, with checks against multiple accounts
- only points from games staked in real ANSEM would count
- no rewards to agents, the House or team accounts
- a legal review of paid play and rewards in the countries where players are

Until a season says otherwise, points convert to nothing.

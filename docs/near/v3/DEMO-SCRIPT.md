# Demo video script (under 2 minutes) and X post

For Benita (demo and social). Everything below is true today, on NEAR testnet. Do **not** say "mainnet",
"audited", "AI-powered" or "no admin keys on everything": the limits are in the README and are the honest line.
Total: about 1 minute 45 seconds at a calm pace (about 250 spoken words).

## Before you record (10 minutes)

1. Make sure the project account has at least 0.5 NEAR (`kova-v3-mwg6hrmb.testnet`).
2. Start the site: `npm run dev`, open `http://localhost:3000/near`.
3. Start the keeper (rounds finish by themselves):
   `KEEPER_ACCOUNT=kova-v3-mwg6hrmb.testnet KEEPER_KEY_FILE=$HOME/.kova-testnet/kova-v3-mwg6hrmb.testnet.key npm run keeper:near`
4. Start the Foreman a few minutes ahead so it has posted recaps: `FOREMAN_ROUNDS=15 npm run foreman:near`
5. Sign in. On the live site that is email or a wallet. To record on this Mac with no wallet, use the developer
   sign-in described in `docs/near/v3/SITE.md` (localhost only, testnet only). Say "testnet" on screen either way.
6. Have the CHIP mine open and about 100 CHIP in the account. Record the screen at 1080p, mouse slow, no notifications.

## The script

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 to 0:10 | Landing page, the live board counting down | "This is Kova, a mining game for NEAR memecoins. Every coin gets its own mine: a five by five grid. Every minute, one square wins." |
| 0:10 to 0:25 | Mines page, then open the CHIP mine | "Put coins on a square. If yours wins, you get your coins back, a share of everyone else's, and fresh CHIP. And ten percent of the losing coins is burned for good, so the more people play, the less of the coin is left." |
| 0:25 to 0:50 | Pick a square, press Put 10 CHIP, show the notice; wait for the result; show Last round and the burn | "I sign in once. After that, staking CHIP needs no wallet pop-ups. The contract picks the winner from NEAR's own random number. Here is the result, and here is exactly what was burned." |
| 0:50 to 1:10 | CHIP page: the "no admin key" panel, then the burn per mine | "You don't have to trust us. This page reads the chain live: the mines have no access keys, so nobody, including us, can change their rules or move their coins. On this testnet, the CHIP and factory accounts still hold a key; we say so right here." |
| 1:10 to 1:30 | Mines page: the Foreman panel with recaps and its keys | "This is the Foreman. It plays beside you with a fixed rule and posts a recap of every round to NEAR's social contract. It has two limited keys and no way to move coins. These recaps are templates, not AI, and the page says so." |
| 1:30 to 1:45 | Open a mine page (type a coin), then the landing page | "Any accepted coin can get a mine in two steps: open it, then register it with the coin. Kova's grid is based on ORE, a mining game on Solana, rebuilt on NEAR. Everything you saw is NEAR testnet, with coins that have no value." |

## What to leave out (not true yet)

- Mainnet, real money, an audit, or "no admin keys" about the whole system.
- That an AI writes the Foreman's recaps (it is a template until a key is connected).
- That a meme.cooking coin already has a Kova mine (the "cooking now" panel only lists what is cooking).
- Email sign-in, unless it has been run on the site you are recording.

## X post (edit freely)

> Put your memecoin on a square. Every minute, one square wins. 🟪
>
> Kova is a mining game for NEAR memecoins: every coin gets its own 5x5 mine, losing coins go to the winners, and 10% is burned for good. Rebuilt from ORE (Solana) for NEAR.
>
> Live on testnet, mines have no admin keys, check it on chain. Demo below.
>
> #NEARHackathon @NEARProtocol

(Add the demo video and the link to the site or repo. Keep "testnet" in it. If you attach a link to the live site,
check first that the new site is deployed there; today the live near.kova.surf is still the older poker version.)

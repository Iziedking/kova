# Kova on NEAR: UI brief

Written 2026-11-12. Covers the NEAR mode pages: `/near` (play) and `/near/token` (the token page).
Platform: Next.js 16 app in this repo, desktop and phone browsers, NEAR testnet.

## Who and what

- **First user:** a hackathon judge who has never seen Kova, has a NEAR testnet wallet, and gives the
  page two minutes. They play alone.
- **Second user:** a memecoin player who comes back to play tables and watch CHIP's supply.
- **Outcome:** sign in once, get chips, play one round against the House, watch the pot burn, and
  see supply fall. All in about two minutes, with one wallet approval.
- **Non-goals:** Trade mode, the Dealer, Privy sign-in, mainnet, any NEAR transfer other than the one
  key approval.

## Meaning

CHIP is a memecoin that only lives at the poker table: every pot burns some of it, and the
community's play decides each day whether supply grows or shrinks.

## Emotional contract

After the first round the player should feel they *moved the token*: their pot burned real supply
on a public ledger. It would feel false if a number moved without a transaction behind it, if the
burn were animated before the chain confirmed it, or if a tie were dressed up as a win.

## Focal object

**The supply counter.** One large, tabular CHIP supply figure that is read from the contract and
only changes when a confirmed transaction changes it. At the showdown the burned amount leaves the
pot and the counter steps down to the new on-chain value. The same counter heads the token page.
Rejected: a 3D chip or a pile of chips (decorative, says nothing about supply); a price chart
(the track says the mechanic is judged, not the chart).

## Action hierarchy

1. Primary, always one at a time, in the first viewport: **Connect wallet** → **Get 1,000 CHIP** →
   **Play the House** → **Lock my pick** → (round runs) → **Play again**.
2. Supporting: join an open table, choose stake and round length, open the token page.
3. Secondary until asked: explorer links, the House's reason, price evidence, contract parameters.

## Trust boundary

| Fact | Source | How the UI labels it |
| --- | --- | --- |
| Supply, treasury, burned, balances, tables, days | CHIP contract view calls | "On chain", with the contract account linked |
| Every mint, burn, stake and payout | the transaction | explorer link beside the line |
| Market prices | DEX Screener, one pinned Rhea pool per coin (mainnet) | "Mainnet price via DEX Screener" plus capture time; swaps in the last 5 minutes beside each coin |
| Who won | settler's reported prices | "Prices reported by Kova's settler" with a link to the evidence |
| The House's pick | sealed until the round ends | hidden, then shown with its rule |
| The 60-day chart | simulation | "Simulated, not live" on the chart itself |
| Blinds owed | contract view | "Owed now, collected on your next move" |

Testnet everywhere: a persistent "NEAR testnet. CHIP has no value." line under the header.

## Flows and states

**Connect.** Loading wallets / connecting / connected / wallet rejected / wrong network.
**Game key.** One approval adds a key that can only call CHIP's game methods and cannot move NEAR.
States: not added / waiting for approval / active (shows allowance left) / rejected (explain,
offer retry; play still works with a popup per action).
**Starter.** Unclaimed / claiming / claimed / already claimed / treasury empty.
**Play the House.** Choose stake (10, 25, 50, 100) and round (60 s, 90 s, 5 min). States: House
available / House sitting out (shows its bankroll) / House busy / opening / joined.
**Pick.** Market list with live price, liquidity and source; unavailable markets disabled with the
reason. Commit = join_table with the hash; the pick is sent to the settler only after the seat is
confirmed. States: choosing / sending / seated / pick not accepted (retry).
**Round.** Waiting for the settler (start window countdown) / running (countdown to end) /
settling / settled / refunded. If the settler misses its window: "The settler did not report.
Anyone can refund this table now" with a **Refund** button (void_table).
**Showdown.** Winner or tie, each pick's move, award, and the burn line: "This pot burned N CHIP.
Supply is now X." House reason appears here.
**Token page.** Loading / live / RPC unreachable (keep last values, mark stale with time).

## Interaction model

Single column on phones, two columns on desktop (table left, supply and day progress right).
The round view polls the contract every 2 s while a table is not final, otherwise every 15 s.
Numbers update only from chain reads; optimistic UI is limited to button pending states.

## Motion map

| Moment | Treatment | Reason |
| --- | --- | --- |
| Surface entry | existing `RevealCard` settle | reading order |
| Pick selection | border and fill on the chosen market | confirms the choice |
| Countdown | ring drawing down, numbers tabular | real time passing |
| Burn | burned amount slides from the pot into the counter, counter steps to the confirmed value once | the mechanic, tied to a confirmed tx |
| Day target | bar fills to settled/target | real progress |
| Failure | motion stops, state text and the recovery action | no false confidence |

`prefers-reduced-motion`: the counter swaps value without the slide; countdown shows numbers only.

## Accessibility

Every number has a text label; the counter is announced through an `aria-live="polite"` region only
when it changes on chain. Market choices are a radio group. Buttons are at least 44 px tall. Colour
never carries win/lose alone (text says "Won", "Lost", "Tie"). Contrast uses the existing tokens.

## Tokens and components reused

`src/styles/tokens.css`, `Button`, `Badge`/`LiveBadge`, `Card`, `SectionHeader`, `ResourceView`,
`InlineNotice`, `RevealCard`, `toast`, `formatChip` from the CHIP adapter. No new colour tokens;
the burn uses the existing danger tone for the burned amount and ink for the counter.

## Verification

A recorded smoke path on the hosted subdomain: new testnet account → connect → key approval →
starter claim → Play the House at 60 s → pick → showdown with burn → token page shows the lower
supply and today's count up by one. Plus phone width (375 px), keyboard-only, and motion-off passes.

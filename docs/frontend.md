# Kova frontend (v2)

The consumer frontend for **Kova - Poker for Meme Stocks**: Predict (secret pick) and real-money Trade tables on Solana, staked in ANSEM. Built from `KOVA_FRONTEND_IMPLEMENTATION_V2`, the approved mockups, and the backend as it stood at branch time (`main` @ `0862583`).

This document is the frontend's source of truth for structure, integration seams and honest status. Nothing here claims a fixture-backed screen is live.

## Run it

```text
npm ci
npm run dev                      # fixtures by default: every screen has sample data + a "Sample data" banner
NEXT_PUBLIC_KOVA_PREVIEW_VIEWER=1 npm run dev   # also render the signed-in shell without Privy
npm run check                    # typecheck, lint, tests, proofs, build, client-bundle scan
npx playwright test              # builds with fixtures + the auth stub, then runs the e2e suite
```

| Variable | Where | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_KOVA_DATA_SOURCE` | build | `api` or `fixtures`. Unset: fixtures under `next dev`, api everywhere else. |
| `NEXT_PUBLIC_KOVA_PREVIEW_VIEWER=1` | build | Dev only. Needs fixtures. Renders a signed-in viewer without Privy. |
| `NEXT_PUBLIC_KOVA_AUTH_STUB=1` | build | Test only. Needs fixtures. Replaces Privy with a deterministic stub (OTP `424242`). |
| `NEXT_PUBLIC_PRIVY_APP_ID` / `PRIVY_APP_SECRET` | build / server | Existing. Required for real sign-in and for server-side session checks. |
| `KOVA_BACKEND_API_URL` | server | Existing. `next.config.ts` now rewrites `/api/game/*` to it, so the browser stays same-origin. |

A build that does not enable fixtures contains **no fixture data, preview viewer or auth stub**: `next.config.ts` swaps those modules for inert stand-ins (Turbopack `resolveAlias` and a webpack `NormalModuleReplacementPlugin`). This was verified against both `next build` and `next build --webpack` output.

## Routes

| Route | Access | Notes |
| --- | --- | --- |
| `/` | public | Marketing landing (no auth provider mounted). |
| `/login` | public | Kova-owned sign-in: X, email + OTP, wallet, first-run identity, safe `next`. |
| `/app` | public | Lobby: Live Now, Trending, Meme Stocks (ClawPump / pump.fun), Hot Players, Recent Showdowns. |
| `/play` | public | Modes, open tables, create table, challenge. `?intent=create` gates on sign-in. |
| `/tables/[tableId]` | public (spectate) | Waiting room, Prediction match, Trading match, settling, showdown, cancelled. Actions gate. |
| `/markets`, `/markets/[mint]` | public | Discovery (URL-backed filters) and asset page. |
| `/leaderboard`, `/profile/[username]` | public | Rankings and player records. `/profile/me` resolves to the viewer. |
| `/portfolio`, `/settings`, `/notifications` | **auth** | Proxy redirect + server-side session check + client `AuthGuard`. |
| `/legal/risk` | public | Kova risk disclosure. **Draft copy - needs legal review.** |
| `/legacy/*` | public | The previous LP product, quarantined and unchanged. |

Access model (blueprint 44): browsing is public; **account actions** gate on click (`useRequireAuth`, returning the person to the action via `?next=`/`?intent=`); **money actions** additionally require a wallet (`requireWallet`, only at stake/trade time). `/app` and `/play` are public lobbies rather than private routes, which resolves a conflict between the blueprint route matrix and its own "guests can browse" rule; to make either private, add its prefix to `PROTECTED_PREFIXES` in `src/auth/protected-routes.ts`.

## Architecture

```text
UI component
  -> feature hook (useResource / useTradeFlow / useTradeQuote)
  -> KovaServices (src/services/contracts.ts)      <- the seam
       |-- api        src/services/api/services.ts       real routes; PENDING_INTEGRATION for the rest
       `-- fixtures   src/features/fixtures/*            dev only, never in a production build
```

- `src/types/*` - frontend contracts (market, competition, social, trading, portfolio, service envelope).
- `src/services/adapters/game-table.ts` - maps the backend's prediction-only `PublicTable` to `PublicTableSummary`/`TableDetail`, leaving anything the backend does not supply null or empty.
- `ServiceResult` has a first-class `PENDING_INTEGRATION` outcome. Screens render it as **"Not connected yet"** with the missing capability key - never as empty data or success.
- `src/features/auth/viewer.tsx` - the one place UI learns who the viewer is. `PrivyViewerBridge` adapts Privy's headless hooks; screens never import Privy.
- File naming follows the repository (kebab-case), not the blueprint's PascalCase illustration.

## Backend integration status

**Connected (real):** `GET /api/game/capabilities`, `GET /api/game/tables`, `GET /api/game/tables/:id`, `POST /api/game/tables` (prediction drafts), `POST /api/game/tables/:id/invitations`, `POST /api/game/invitations/claim`. Responses are validated with the shared Zod schemas; a malformed response is refused, an unreachable service is reported as unavailable.

**Pending** - each returns `PENDING_INTEGRATION` from `src/services/api/services.ts` naming its capability. Replace the method body; the screen needs no change:

| Capability key | Screen(s) | What the backend must provide |
| --- | --- | --- |
| `markets.feed`, `markets.clawpump_feed`, `markets.asset` | Home, Markets, asset page, rail | Normalized `MarketAsset` (see `src/types/market.ts`), incl. eligibility flags and freshness. |
| `markets.candles`, `markets.trades` | Charts, activity | OHLCV per timeframe; recent trades. |
| `game.join`, `game.ready`, `game.start` | Waiting room | Funded seat / ready / start (needs live ANSEM escrow). |
| `prediction.dealer_admission`, `prediction.pick_submission`, `prediction.private_state` | Pick flow | Dealer check of an exact mint; commitment + wallet-proof submission (`POST /tables/:id/submissions` exists but needs the wallet challenge, salt and rules hash flow); viewer's lock state. |
| `settlement.result` | Showdown / result | `ShowdownResult` incl. reveals (prediction) and standings. |
| `trading.match_state`, `trading.quotes`, `trading.execution` | Trading match | Per-player competition ledger, positions, PnL % standings, **backend-issued quotes**, real execution and confirmation status. The frontend never computes execution. |
| `trading.table_creation` | Create table | Trading tables. |
| `social.rankings`, `social.showdowns`, `social.profiles`, `social.history`, `social.challenges` | Leaderboard, profile, Hot Players | Players, ratings, history, direct challenges. |
| `portfolio.summary` | Portfolio | Balances, holdings, allocations, activity from a backend source (not derived in the browser). |
| `notifications.feed` | Notifications | Challenge / match / payout events. |
| `profile.identity` | First-run, settings | Username claim + availability, avatar. Until then identity is kept **on this device only** (`identity-store.ts`). |

Known backend limits the UI already surfaces: prediction rounds are fixed at 15 minutes, `POST /tables` accepts 2-6 players and a small stake cap (10 ANSEM raw `10_000_000`) - the create-table presets (10/25/50/100) will be refused above the cap with the backend's message. All presets live in `src/features/competitions/table-options.ts`.

## Trading Mode is real money

- No paper trading, virtual equity or simulated fills exist in the UI. Execution is a backend capability; when it is unavailable the ticket says so and disables review.
- The estimate rows are the backend's quote shown verbatim; a quote expires and must be refreshed.
- The lifecycle is a state machine (`useTradeFlow`): review -> preparing -> wallet approval -> submitted -> confirming -> confirmed / failed. `confirmed` is only set when the backend reports it.
- Wallet signing itself is **not implemented**: the repository's custody boundary (`privy-client-provider.tsx`) forbids requesting signatures until the phase-00 gates pass. `trading.execute` is where that integration lands.
- Fixture trades never carry a `txSignature` and are labelled "Sample data - no real trade is sent".

## Design system

Tokens live in `src/styles/tokens.css` (legacy token names alias them). Violet is brand/action/selection only; green/red are market direction only (and a sign is always in the text); amber is risk; borders before shadows; Space Grotesk / Inter / JetBrains Mono. Primitives: `Button`, `Input`, `Tabs`, `Badge`, `Skeleton`, `Toast`, and one Radix-based overlay exposed as `Dialog`, `BottomSheet`, `Drawer` and `ResponsiveOverlay`. Every section uses `ResourceView` for loading / empty / error / pending.

Deviations from the blueprint, all where the mockups differ: the Home hero and right rail follow the mockup at >=1280px (blueprint: compact intro); the Trading Buy tab is a soft green wash rather than violet; mobile Buy/Sell are solid green/red as in the mockup.

## Verification

Run on this branch (all against the code in this tree):

- `npm run check` (typecheck, lint, 215 unit tests, both proofs, Turbopack build, client-bundle scan), `npx next build --webpack`: pass. Unit tests added: formatting, the table adapter, pending-state honesty, data-source and viewer guards, the proxy, redirects.
- `npx playwright test`: 57 tests - public browsing, every auth gate, the full email / first-run / redirect flow, hostile `next`, six viewports x eleven routes with no horizontal overflow, signed-in journeys (wallet gate then resumed trade, review -> confirmed and a failed trade, secret pick lock, settled results), legacy surfaces.
- Screenshots compared against the mockups for Auth (desktop and mobile), Home (desktop and mobile), Trading (desktop and mobile), Portfolio.

## Known gaps

- Real X / email / wallet sign-in through Privy was **not exercised**: no Privy credentials were available. The Kova UI and state machine are covered through the auth stub; `PrivyViewerBridge` is type-checked against the installed SDK. The Privy dashboard must enable Twitter/X, email and Solana wallets for the app id.
- Terms of Service and Privacy Policy pages do not exist; the sign-in screen links to `/legal/risk` as a stand-in.
- Watchlist and identity are device-local until backend endpoints exist.
- Result share is a link share; there is no generated share card.
- Trading `Sell` is disabled without a position; `Trade in current match` from a market page needs an "active match" endpoint.
- Playwright drives real browsers against a production build and is sensitive to host load (early runs happened at a host load average above 60); local runs use two workers and retry once. CI keeps four workers and two retries.

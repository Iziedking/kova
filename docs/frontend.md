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
       |-- api        src/services/api/services.ts       real routes for every screen
       `-- fixtures   src/features/fixtures/*            dev only, never in a production build
```

- `src/types/*` - frontend contracts (market, competition, social, trading, portfolio, service envelope).
- `src/services/adapters/game-table.ts` - maps the backend's `PublicTable` for both game modes to `PublicTableSummary`/`TableDetail`, leaving anything the backend does not supply null or empty.
- `ServiceResult` has a first-class `PENDING_INTEGRATION` outcome. Screens render it as **"Not connected yet"** with the missing capability key - never as empty data or success.
- `src/features/auth/viewer.tsx` - the one place UI learns who the viewer is. `PrivyViewerBridge` adapts Privy's headless hooks; screens never import Privy.
- File naming follows the repository (kebab-case), not the blueprint's PascalCase illustration.

## Backend integration status

**Connected (real):** every screen. Capabilities, tables (lobby, invitations, private tables), wallet proof and built-in wallets, Dealer pick check with the stock-meme pick list, private picks, co-signed deposits and confirmation, showdown results, payout and refund claims, Trade mode (live-price quotes, simulated fills, live standings), markets (ClawPump feed, stock memes, price chart and trades from GeckoTerminal), profiles with Privy-verified X, leaderboard, hot players, recent showdowns, direct challenges, notifications and portfolio. Money paths live in [`game-play.ts`](../src/services/api/game-play.ts) and [`trading.ts`](../src/services/api/trading.ts); social and account surfaces in [`social.ts`](../src/services/api/social.ts) and [`player.ts`](../src/services/api/player.ts). Responses are validated with Zod; a malformed response is refused and an unreachable service is reported as unavailable.

`PENDING_INTEGRATION` stays in the service contract so any future capability can ship its screen before its backend, shown as "Not connected yet" rather than empty data.

Limits the UI keeps to: stakes of 1 to 10 ANSEM and rounds of 5, 10 or 15 minutes (the escrow program caps both), 2 to 6 players, and only the "any eligible meme stock" market rule until same-ticker and specific-market tables are enforced on the server. Presets live in `src/features/competitions/table-options.ts`.

## Wallet signing

Prediction play asks the player's own wallet for three kinds of approval, each through the wallet's prompt: a message proving wallet ownership (no funds move), the stake deposit, and a payout or refund claim. `Viewer.gameWallet` wraps Privy's Solana hooks (`useSignMessage`, `useSignAndSendTransaction`) for the wallet linked to the account. Privy creates a player-owned embedded Solana wallet for accounts without a wallet. External wallets can also be connected; ownership is verified by the backend. No delegated or session signer exists, and the app never holds a player key. `NEXT_PUBLIC_KOVA_SOLANA_CHAIN` selects devnet (default) or mainnet.

## Trading Mode

- The current implementation uses a virtual $10,000 account with simulated fills at live DEX prices and a 0.3% fee. ANSEM stakes and claims use real escrow on the configured network. The ticket labels this behavior. Unavailable execution disables review.
- The estimate rows are the backend's quote shown verbatim; a quote expires and must be refreshed.
- The lifecycle is a state machine (`useTradeFlow`): review -> preparing -> wallet approval -> submitted -> confirming -> confirmed / failed. `confirmed` is only set when the backend reports it.
- Simulated fills need no swap signature. Players approve their stake deposit and payout or refund claim in their own wallet. Real swap execution remains subject to the gates in [trading-mode.md](trading-mode.md).
- Fixture trades never carry a `txSignature` and are labelled "Sample data - no real trade is sent".

## Design system

Tokens live in `src/styles/tokens.css` (legacy token names alias them). Violet is brand/action/selection only; green/red are market direction only (and a sign is always in the text); amber is risk; borders before shadows; Space Grotesk / Inter / JetBrains Mono. Primitives: `Button`, `Input`, `Tabs`, `Badge`, `Skeleton`, `Toast`, and one Radix-based overlay exposed as `Dialog`, `BottomSheet`, `Drawer` and `ResponsiveOverlay`. Every section uses `ResourceView` for loading / empty / error / pending.

Deviations from the blueprint, all where the mockups differ: the Home hero and right rail follow the mockup at >=1280px (blueprint: compact intro); the Trading Buy tab is a soft green wash rather than violet; mobile Buy/Sell are solid green/red as in the mockup.

## Verification

The September 29 data-connection repair passed VPS verification with Node.js 24: 269 unit tests, 57 Chromium browser tests, typecheck, lint, the default production build, client-bundle scan, core and game proofs, and both disposable PostgreSQL integration harnesses. Browser tests use fixture services and stub authentication. Real Privy sign-in against the deployed backend and actual wallet transactions remain unverified. Earlier verification is listed below as historical evidence.

Previously run on this branch:

- `npm run check` (typecheck, lint, 215 unit tests, both proofs, Turbopack build, client-bundle scan), `npx next build --webpack`: pass. Unit tests added: formatting, the table adapter, pending-state honesty, data-source and viewer guards, the proxy, redirects.
- `npx playwright test`: 57 tests - public browsing, every auth gate, the full email / first-run / redirect flow, hostile `next`, six viewports x eleven routes with no horizontal overflow, signed-in journeys (wallet gate then resumed trade, review -> confirmed and a failed trade, secret pick lock, settled results), legacy surfaces.
- Screenshots compared against the mockups for Auth (desktop and mobile), Home (desktop and mobile), Trading (desktop and mobile), Portfolio.

## Known gaps

- Real X / email / wallet sign-in through Privy was **not exercised**: no Privy credentials were available. The Kova UI and state machine are covered through the auth stub; `PrivyViewerBridge` is type-checked against the installed SDK. The Privy dashboard must enable Twitter/X, email and Solana wallets for the app id.
- Terms of Service and Privacy Policy pages do not exist; the sign-in screen links to `/legal/risk` as a stand-in.
- Watchlists remain device-local. Profiles save through the backend; the browser cache updates after a successful save.
- Result share is a link share; there is no generated share card.
- Trading `Sell` is disabled without a position; `Trade in current match` from a market page needs an "active match" endpoint.
- Playwright drives real browsers against a production build and is sensitive to host load (early runs happened at a host load average above 60); local runs use two workers and retry once. CI keeps four workers and two retries.

## Data rendering contracts

Account changes invalidate resource reads. Wallet changes also invalidate wallet-dependent reads; table and match reads retain their state while a wallet connects so the pending trade can resume. Portfolio requests wait for authentication and carry the current access token and wallet. Browser proof and seat caches are scoped to the account.

Trading responses include the complete eligible market collection, including held assets outside the trending feed. Missing held-asset marks produce unavailable equity and PnL; all ranks remain unavailable until every funded account has a mark. Settlement refuses incomplete price evidence. Mobile and desktop expose the market selector.

Table rosters and activity come from authorized backend reads. Activity forwards only validated public status messages. Players without profiles render without profile links or challenge actions. Profile totals use all-time backend aggregates; history remains capped at 50 records.

Market previews use actual hourly closes and load when visible. Empty or unavailable history has an explicit state. GeckoTerminal charts require a pool whose base token matches the requested mint. Market activity counts distinct settled public tables over seven days; private games and hidden picks do not contribute.

A claim signature means submitted. Claims poll the backend entry state before displaying receipt, retain a pending signature for retries, and resume it after reload when browser storage is available. Portfolio and notifications distinguish settlement awards from independently confirmed receipts.

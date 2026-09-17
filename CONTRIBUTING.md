# Contributing to KOVA

KOVA is an evidence-led liquidity coordination product for stock-paired
memecoins on Solana. Contributors are expected to extend the product without
weakening its evidence boundaries, user ownership, or refusal states.

This document is the public contribution contract, and it is the single source
of truth for anyone joining the repository, including a coding agent working on
a contributor's behalf. Read it in full before making a change: it states what
is real today, what is still a fixture, which tasks are open, and which
boundaries may not be crossed. The owner supplies the detailed execution plan
separately.

Do not publish private planning material, internal research, prompts, operation
maps, credentials, wallet details, or generated evidence.

## Current build boundary

Last updated 2026-09-17. The repository is a preview build, not a live
financial application.

### What is real

- Finalized Solana RPC reads for pool identity, mints, token programs,
  decimals, tick arrays, current tick and sqrt price, behind the existing
  adapter seams.
- Reward-slot state and vault balances, read-only.
- The evidence and refusal contracts, covered by the unit suite.
- Authentication. Privy email and wallet login is live. Embedded wallet
  creation is `off` on both chains, so a session grants identity and nothing
  else.
- The consumer interface: landing page, risk disclosure, login, the `/app`
  shell and the `/app` home with its live capability panel.

### What is still fixture or placeholder

These are the gaps to close. Do not present any of them as real.

1. `KOVA_SOLANA_RPC_URL` is unset in most environments, so the app falls back
   to fixture mode. This single variable is why `stockCheck` reports
   `fixture_backed` and `stockFloatMonitor` and `rewardEvidence` report
   `unavailable`.
2. `ANSEM_PENDING_MINT` in `src/domain/campaign-catalog.ts` is a literal
   placeholder, not a canonical mint.
3. The sized quote is incomplete: a required tick array is missing, so quotes
   are not executable and `phase00Feasibility` stays `blocked`.
4. Campaigns are two hardcoded previews. There is no creator flow.
5. Without `KOVA_DATABASE_URL` the evidence store is process-local and does not
   survive a restart.
6. Positions do not exist yet, and the backing review is still the older modal
   rather than the routed step flow.

Signing, transaction preparation and automated rebalancing are **off by
design**. That is a decision, not a gap, and it is not yours to reverse.

### Current workstreams

The owner is working on the routed market surfaces and the backing flow in
`src/app`, `src/components`, `src/design` and `src/auth`. Avoid those paths to
prevent collisions.

The open contributor tasks, in priority order:

1. **Take the read path off fixtures.** Provision an approved HTTPS Solana RPC
   and set `KOVA_SOLANA_RPC_URL`. Verify through `/api/health` that
   `stockCheck` leaves `fixture_backed` and that `stockFloatMonitor` and
   `rewardEvidence` leave `unavailable`. Highest value task in the repository.
2. **Close the sized-quote gap.** `npm run phase00:quote` reports a missing
   tick array, so the quote is not executable. Either make it complete or
   document precisely why it cannot be, with the observed slot and arrays.
3. **Establish canonical $ANSEM identity.** Replace the placeholder mint and
   verify mint authority, supply and decimals on chain. Do not promote a
   reward to `funded` without independent evidence of authority and balance.
4. **Make evidence restart-safe.** Apply
   `src/backend/db/migrations/0001_float_evidence.sql`, set
   `KOVA_DATABASE_URL`, and prove a snapshot survives a restart.
5. **Deploy the VM backend** using the `deploy/` recipe and confirm
   `/api/backend-health` reports the backend reachable with every financial
   capability still disabled.

Each task is its own pull request. A capability may only change state when the
evidence behind it actually changed.

### Git identity

Before your first commit, confirm your commits will be attributed to you:

```bash
git config user.name
git config user.email
```

If either is empty, git invents an address from your machine hostname. Those
commits are credited to whichever account happens to own that address, which
may not be yours. Set both to the name and the email registered on your GitHub
account.

## Non-negotiable safety rules

Do not:

- add private keys, seed phrases, RPC secrets, database credentials, or provider
  credentials to the repository or logs;
- create a backend signing path or delegated custody path;
- sign, broadcast, simulate as if successful, or fund a Solana transaction;
- move user funds, create a position, collect fees, withdraw liquidity, or claim
  rewards;
- enable live reads, paid research, transaction preparation, rewards, or
  automated management by changing environment defaults;
- bypass a blocked phase gate or turn a fixture into a live claim;
- commit generated artifacts or hidden internal project material;
- push directly to `main` or rewrite shared history.

The agent may explain evidence, calculate deterministic results, refuse blocked
actions, and prepare read-only or explicitly non-executable structures. The
wallet remains the user's authority. Any action involving a wallet, signing,
capital, deployment, migration, provider spend, or production state requires
separate owner approval.

## Start here

Use Node.js 24 LTS and the locked dependency graph.

```bash
git fetch origin
git status --short --branch
git switch -c feat/short-description
npm ci
```

If the working tree is not clean after fetching, stop and tell the owner. Do
not reset, stash, discard, or overwrite existing work. Do not work directly on
`main`.

Before coding, inspect the relevant existing module, its tests, the public
README, and the current owner-provided build plan. External SDK behavior must
be verified against the installed package and current source before adding a
new call.

## Engineering expectations

- Keep business logic deterministic and independent of the UI and network when
  possible.
- Validate external payloads at the boundary with the existing typed schemas.
- Use integer or string base units for money and token amounts. Never use
  floating-point arithmetic for financial values.
- Preserve explicit `unavailable`, `blocked`, `unknown`, and `fixture-backed`
  states. Do not replace them with empty data or optimistic success.
- Keep external providers behind the existing adapter seams.
- Add an adversarial test for every new refusal, replay, stale-data, authority,
  or capability boundary.
- Keep public copy honest about what is observed, reported, inferred, and not
  proven.
- The interface is an active workstream and is owner-led. Coordinate before
  changing `src/app`, `src/components`, `src/design` or `src/auth`.
- A surface may never claim more than its evidence proves. If a capability is
  unavailable, the interface says so rather than hiding it.

## Required local checks

Run the full gate before opening a pull request:

```bash
npm run typecheck
npm run lint
npm test
npm run prove
npx next build --webpack
npm run check:client-bundle
git diff --check
```

`npm run check` is the combined repository gate. If a Windows host blocks
Node or esbuild child processes with `spawn EPERM`, rerun the affected command
in a permitted local shell and record the exact command and result in the PR.
Do not report a check as passed when it was skipped.

When a browser-facing flow changes, also run the relevant Playwright test:

```bash
npm run test:e2e
```

Do not claim a wallet was connected, a signature was requested, or a
transaction was simulated unless the test output and capability response prove
that exact state.

## Running the interface locally

The frontend runs with no credentials and no RPC. Everything degrades to an
honest fixture state rather than failing.

```bash
npm ci
npm run dev
```

Open `http://127.0.0.1:3000`. If that port is busy, use
`npm run dev -- --port 3001`.

| Route | What it shows |
| --- | --- |
| `/` | Landing page. Public, reads no app data |
| `/legal/risk` | Risk disclosure |
| `/login` | Privy email and wallet sign-in |
| `/app` | Home: what KOVA does, one next action, the live capability panel |
| `/markets` | Market selector and depth cross-section |
| `/markets/nvdge-nvdax` | Market dossier, Initial StockCheck, backing review |
| `/api/health` | The capability response the interface renders |

Sign-in needs `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_ID` and
`PRIVY_APP_SECRET` in a local `.env`, and your origin must be registered in the
Privy dashboard. Without them `/login` renders an honest
`Sign in is not configured` state and the rest of the app still works, because
reading a market never requires an account. Ask the owner for credentials; do
not commit them. `.env` is ignored.

To see the read path leave fixture mode, set `KOVA_SOLANA_RPC_URL` to an
approved HTTPS endpoint and watch `/api/health` change. That is the fastest way
to confirm task 1.

### Checking a visual change

```bash
npm run test:e2e
```

Playwright builds the production output and serves it, so the suite is
deterministic; it does not run against `npm run dev`. Relevant specs:

- `tests/e2e/landing.spec.ts` covers the landing sections, the captured
  evidence console, reduced motion and 360px overflow.
- `tests/e2e/auth.spec.ts` covers login, the app shell, route protection and
  the capability panel.
- `tests/e2e/legacy-surfaces.spec.ts` guards the older surfaces that still rely
  on the scoped legacy stylesheet.

Two rules the tests enforce, because they are product requirements rather than
preferences:

- Every value on a public surface must be real or absent. Landing evidence is
  derived from `MARKET_CATALOG` and asserted against it, so the page cannot
  drift from the domain or state a pool that does not exist.
- `prefers-reduced-motion` must produce a still, fully legible page. Check it
  with Chrome DevTools, Rendering, "Emulate CSS prefers-reduced-motion".

Before committing a native module change or an install, stop any running dev
server. On Windows a live server holds files open and `npm ci` will fail
partway through with `EPERM`, leaving `node_modules` incomplete.

## Pull-request workflow

Use one focused branch and one focused pull request.

1. Create a branch from the latest owner-approved `main`.
2. Make the smallest change that closes one plan item or one tested defect.
3. Add or update tests before broadening the implementation.
4. Run the required checks and inspect the final diff.
5. Push the branch and open a PR targeting `main`.
6. Wait for owner review. Do not merge the PR yourself.

Recommended branch names:

```text
feat/agent-evidence-loop
fix/stock-check-boundary
test/raydium-read-refusal
docs/contributor-handoff
```

The PR description must include:

- the user-facing or operator-facing outcome;
- the exact files and plan boundary touched;
- tests run, with counts and any environment limitation;
- whether public capability, custody, signing, capital, deployment, or secrets
  changed;
- any new owner approval required;
- known limitations and the next safe step.

Use a short commit subject in the imperative form, for example:

```text
feat: add bounded stock evidence projection
fix: preserve unknown issuer eligibility
test: cover stale stock reference refusal
docs: clarify contributor safety boundary
```

## Definition of done

A contribution is ready for owner review only when:

- the change is scoped to the approved build boundary;
- typecheck, lint, tests, proof, production build, and bundle scan pass;
- new money or authority paths fail closed and have adversarial coverage;
- public copy matches the actual capability response;
- no secrets, private planning files, generated artifacts, or wallet material
  are included;
- the PR explains what remains unproven;
- no live transaction, provider spend, deployment, migration, or Git merge was
  performed without owner approval.

When in doubt, stop at the boundary and ask the owner. A precise refusal with
evidence is a valid KOVA result.

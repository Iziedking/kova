# Contributing to KOVA

KOVA is an evidence-led liquidity coordination product for stock-paired
memecoins on Solana. Contributors are expected to extend the product without
weakening its evidence boundaries, user ownership, or refusal states.

This document is the public contribution contract. The owner supplies the
current execution plan separately. Do not publish private planning material,
internal research, prompts, operation maps, credentials, wallet details, or
generated evidence.

## Current build boundary

The repository is a preview build, not a live financial application.

- Groups 1 through 5 are complete at the fixture, read, evidence, marketplace,
  and browser-reviewed user-owned intent boundaries.
- Group 6 is paused at the explicit owner approval gate for unsigned Raydium
  construction and simulation.
- Groups 7 and 8 are pending.
- VM delivery work has started, but host provisioning, deployment, Vercel
  configuration, production secrets, and rollback remain owner-controlled.
- No contributor may infer that a captured market, reward slot, stock inventory,
  issuer claim, or campaign preview is funded, eligible, safe, or profitable.

The Initial StockCheck remains central. Any new market or underwriting work
must preserve the exact token address and report, independently where possible:

- issuer identity and approved token-address match;
- stock-token eligibility and jurisdiction limitations;
- oracle or reference price, source, timestamp, and freshness;
- available stock-side inventory and redeemability limits;
- pool identity, depth, fixed-size price impact, volatility, and divergence;
- evidence status, blockers, warnings, and what the check does not prove.

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
- Keep UI changes subordinate to the core product and proof gates until the
  owner reopens the UI workstream.

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

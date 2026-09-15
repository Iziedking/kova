# FLOAT

A marketplace for backing stock-paired meme liquidity, with user-owned LP positions and evidence-led market review.

## Current status

Consumer discovery scaffold with a VM backend preview boundary. The page includes two source-backed market identities, captured campaign previews, an initial stock check, a preview-only underwriting decision, and a Wallet Standard user-owned review surface. Campaign creation, wallet signing, paid research, LP execution, rewards and automated management are not implemented. The scaffold refuses transaction preparation and reports these limits in its health response.

The intended first release uses Raydium CLMM, creator-funded ANSEM rewards where native pool authority permits them, and a stock-token inventory and exit-depth check before proposing liquidity.

The VM deployment recipe is in [`deploy/README.md`](deploy/README.md). It is
preview-only and does not enable signing, transaction preparation, rewards, or
automated management.

LP fees and incentives are variable. Users remain exposed to both assets, adverse selection and losses. No principal or return is guaranteed.

## Development

Use Node.js 24 LTS and the exact dependencies in the lockfile.

```text
npm ci
npm run dev
npm run backend:dev
npm run backend:start
npm run check
npm run prove
```

The complete check also scans the generated browser bundle for database URLs,
RPC configuration, private-key markers and other server-only secret markers.

The starting page is an honest captured snapshot, not live market data. No credentials are required. Wallet Standard discovery is browser-only, the legacy delegated-wallet adapter is disabled, and no component can sign.

The VM backend preview listens on `http://127.0.0.1:8787`. It exposes
fixture-backed market, campaign and underwriting routes, plus finalized
sized-quote, Initial StockCheck, stock float-monitor, and Raydium reward-slot
evidence reads when an approved HTTPS RPC is configured. Without RPC, the
Initial StockCheck remains explicitly fixture-backed and the float monitor and
reward evidence remain unavailable. A finalized
Initial StockCheck verifies the catalog's exact pool, stock mint, token
program and decimals through the read-only monitor, while issuer approval,
eligibility, jurisdiction, reference pricing, redeemability, fixed-size price
impact and volatility remain unknown until independent sources are configured.
The float monitor reports total mint supply and the inspected pool vault
balance with Token-2022 authority and extension disclosures. It does not treat
either value as issuer-wide redeemable inventory. Campaign backing and LP
transaction preparation return explicit unavailable responses until their
safety gates pass.

Reward evidence reports the exact initialized Raydium reward slots, reward mint
and vault identities, schedule fields, token programs, decimals, and observed
vault balances. It does not promote a slot into canonical ANSEM identity,
reward authority, or funded campaign status without independent evidence.

Health and capability responses distinguish fixture-backed reads from the
`stockCheck`, `stockFloatMonitor`, and `rewardEvidence` finalized read
capabilities.

Backend environment variables are optional:

```text
FLOAT_BACKEND_HOST=0.0.0.0
FLOAT_BACKEND_PORT=8787
FLOAT_ALLOWED_ORIGINS=http://localhost:3000
FLOAT_SOLANA_RPC_URL=https://your-approved-rpc.example
FLOAT_DATABASE_URL=postgresql://float:change-me@127.0.0.1:5432/float
FLOAT_RECONCILIATION_INTERVAL_SECONDS=300
FLOAT_BACKEND_API_URL=https://api.example.com
```

The RPC URL must use HTTPS. Leaving it unset keeps the backend in fixture mode.
Leaving the database URL unset uses a process-local preview store. Configure
PostgreSQL and apply `src/backend/db/migrations/0001_float_evidence.sql` for
restart-safe evidence snapshots and reconciliation. The frontend does not
receive backend secrets or wallet keys.

When `FLOAT_BACKEND_API_URL` is configured on Vercel as a server-only value,
market detail pages read the VM dossier at request time. The frontend
`/api/backend-health` route verifies that the VM is reachable and that signing,
transaction preparation, and automated rebalancing remain disabled. It returns
an error when the backend is not configured, unhealthy, or reports an enabled
financial capability.

## Structure

- `src/domain`: product contracts, amounts and evidence types
- `src/ports`: adapters' interfaces
- `src/application`: capability reporting and refusals
- `src/backend`: VM API boundary, preview fixtures, health, and capability routes
- `src/app`: Next.js page and HTTP boundaries
- `tests`: executable boundary checks
- `scripts`: proof, market-read, and publication checks
- `deploy`: VM Compose and Caddy recipe

Vercel deployment is not configured or performed. Install the Vercel CLI with
`npm i -g vercel` when setting up environment management, deployment and logs.

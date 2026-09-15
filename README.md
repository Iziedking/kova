# FLOAT

A marketplace for backing stock-paired meme liquidity, with user-owned LP positions and evidence-led market review.

## Current status

Consumer discovery scaffold. The page includes two source-backed market identities, captured campaign previews, a preview-only underwriting decision, and a Privy mandate review surface. Campaign creation, wallet signing, paid research, LP execution, rewards and automated management are not implemented. The scaffold refuses transaction preparation and reports these limits in its health response.

The intended first release uses Raydium CLMM, creator-funded ANSEM rewards where native pool authority permits them, and a stock-token inventory and exit-depth check before proposing liquidity.

LP fees and incentives are variable. Users remain exposed to both assets, adverse selection and losses. No principal or return is guaranteed.

## Development

Use Node.js 24 LTS and the exact dependencies in the lockfile.

```text
npm ci
npm run dev
npm run check
npm run prove
```

The starting page is an honest captured snapshot, not live market data. No credentials are required. The Privy adapter is disabled and no component can sign.

## Structure

- `src/domain`: product contracts, amounts and evidence types
- `src/ports`: adapters' interfaces
- `src/application`: capability reporting and refusals
- `src/app`: Next.js page and HTTP boundaries
- `tests`: executable boundary checks
- `scripts`: proof and publication checks

Vercel deployment is not configured. Install the Vercel CLI with `npm i -g vercel` when setting up environment management, deployment and logs.

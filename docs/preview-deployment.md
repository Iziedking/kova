# KOVA no-value preview deployment

This is the owner-run path for publishing the current verified release ceiling.
It does not enable Dealer admission, wallet signing, escrow, settlement or
payouts.

## Before deployment

1. Review and commit the scoped build batches. Regenerate `npm run
   prove:release` and require `clean=true`.
2. Run `npm run check`, `npm run test:postgres-game` and `npm run
   check:node24` from the reviewed revision.
3. Keep `KOVA_GAME_ENABLED=false`. Leave the Solana RPC empty if the preview
   does not need finalized read features.
4. Confirm `api.kova.surf` resolves to the shared VM and `kova.surf` is
   attached to the KOVA Vercel project before setting CORS.

## VM backend

Follow [`../deploy/README.md`](../deploy/README.md). The preview environment
needs a random PostgreSQL password and the exact Vercel origin in
`KOVA_ALLOWED_ORIGINS`. It does not need Privy server credentials, a pick
encryption key, an ANSEM mint or a Solana RPC.

The shared Agon Caddyfile must contain the reviewed
[`shared-ingress.caddy`](../deploy/shared-ingress.caddy) block. Validate and
reload Caddy after the owner updates that separate repository. The API hostname
must resolve to the VM before Caddy can obtain its TLS certificate.

The shared ingress resolved to `3.96.102.139` on 2026-09-19. The owner must
recheck `api.agon.surf` before using that address for KOVA DNS, since the VM can
change independently of this repository.

After the owner starts the stack, these endpoints must return HTTP 200:

```text
https://api.kova.surf/api/live
https://api.kova.surf/api/ready
https://api.kova.surf/api/health
```

Readiness must say `readyToAdmit=false` and `readyToRecover=false`. Health must
report every financial execution capability as `unavailable`.

## Vercel frontend

If the Vercel CLI is missing on the owner machine, install it with:

```text
npm i -g vercel
```

From the repository root, the owner then links the intended project and adds
the VM origin as the server-only `KOVA_BACKEND_API_URL`. Do not prefix this
variable with `NEXT_PUBLIC_`.

```text
vercel login
vercel link
vercel env add KOVA_BACKEND_API_URL preview
vercel env add KOVA_BACKEND_API_URL production
vercel deploy
```

Inspect the preview first. Production publication remains an owner action:

```text
vercel deploy --prod
```

No Vercel variable may contain the PostgreSQL password, Privy secret, pick key,
ClawPump key, signer material or wallet material.

## Post-deploy receipt

Run the repository-owned read-only verifier against the exact deployed URLs:

```text
KOVA_PUBLIC_URL=https://kova.surf KOVA_BACKEND_API_URL=https://api.kova.surf npm run verify:preview
```

Retain its `kova-preview-release-v1` JSON beside the clean source manifest. A
failed check blocks publication. A passing receipt proves only the no-value
preview endpoint contract.

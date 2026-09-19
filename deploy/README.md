# KOVA VM deployment recipe

This recipe runs the KOVA Hono backend and PostgreSQL on an owner-controlled
VM. The backend is not published directly. The existing ArcRun/Agon Caddy is
the only public service; PostgreSQL is reachable only on KOVA's private Docker
network.


## Ingress

This project publishes no ports and ships no Caddy. The ArcRun/Agon compose
project owns 80 and 443 on this host, and KOVA borrows it: the backend joins
that project's default network as `kova-api`, and the `api.kova.surf` site
block lives in the Agon repository at `deploy/caddy/Caddyfile`.

The reviewed block is kept in [`shared-ingress.caddy`](shared-ingress.caddy).
Copy that complete block into Agon's tracked Caddyfile. The current Agon
checkout has an older broad `reverse_proxy` block for KOVA; replace it so only
`/api/*` reaches the container and every other path returns 404.

Never run `docker compose down` in the Agon directory. It deletes the shared
network and takes this service down with it. Use `up -d`, or restart
individual services.

After changing the site block, Caddy needs an explicit reload:

```bash
docker exec arcrun-caddy caddy validate --config /etc/caddy/Caddyfile
docker exec arcrun-caddy caddy reload --config /etc/caddy/Caddyfile
```

## Before the first start

Generate `npm run prove:release` from the exact source candidate and retain its
`releaseId`, Git head and file hashes with the build record. A manifest that
reports `clean=false` is review evidence for a candidate, not an immutable
release. Build and deploy only after the owner has committed the reviewed
batches and regenerated a clean manifest.

1. Install Docker Engine and Compose on the VM.
2. Use the locked API hostname `api.kova.surf`. An approved HTTPS Solana RPC
   endpoint is optional for the no-value preview and required only for
   finalized read features.
   On 2026-09-19, the existing shared ingress `api.agon.surf` resolved to
   `3.96.102.139` and answered through Caddy. Recheck that address immediately
   before creating the `api.kova.surf` A record; this observation is not a
   permanent infrastructure identifier.
3. Create a VM-only environment file outside Git with these values:

```text
KOVA_ALLOWED_ORIGINS=https://kova.surf
KOVA_SOLANA_RPC_URL=
KOVA_POSTGRES_PASSWORD=replace-with-a-long-random-value
KOVA_RECONCILIATION_INTERVAL_SECONDS=300
KOVA_GAME_ENABLED=false
```

Keep `KOVA_GAME_ENABLED=false` for the preview release. Durable private
admission additionally requires the ANSEM mint, Privy server credentials and
pick-encryption keyring documented in `.env.example`. Supplying those values
does not authorize value-bearing play; `KOVA_LIVE_PLAY_ENABLED` is not wired
and escrow, settlement and payout execution remain unavailable.

4. Start the services from this directory. Compose applies the idempotent
   evidence migration before the backend is allowed to start:

```bash
docker compose --env-file /path/to/float.vm.env up -d --build
```

## Checks and recovery

```bash
docker compose ps
docker compose logs --no-log-prefix migrate
docker compose logs --tail=100 backend
curl --fail https://api.kova.surf/api/health
curl --fail https://api.kova.surf/api/live
curl --fail https://api.kova.surf/api/ready
docker compose restart backend
curl --fail https://kova.surf/api/backend-health
```

Caddy exposes only `/api/*` on the VM hostname. The frontend remains a
separate Vercel deployment; any non-API path on the API hostname returns 404.

Create a custom-format PostgreSQL backup from the running service. Keep the
backup outside the repository and use the VM's approved encrypted backup
destination:

```bash
mkdir -p /var/backups/kova
docker compose exec -T postgres sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump --username=kova --dbname=kova --format=custom --no-owner --file=-' > /var/backups/kova/kova-$(date -u +%Y%m%dT%H%M%SZ).dump
```

For a restore rehearsal, create a separate PostgreSQL container or volume and
an explicitly named isolated network. Restore the dump there, apply the same
migration if required, and run the read-only reconciliation proof from a
container on that network before replacing anything live:

```bash
docker network create kova-restore
docker run --detach --name kova-postgres-restore --network kova-restore --env POSTGRES_DB=kova --env POSTGRES_USER=kova --env POSTGRES_PASSWORD="$KOVA_POSTGRES_PASSWORD" postgres:16.15-alpine3.24@sha256:3c5c8892d184f738f4fe282d14ddaa613a38f00f4189d2d94725ebe6f2909ddb
until docker exec kova-postgres-restore pg_isready -U kova -d kova; do sleep 2; done
docker run --rm --network kova-restore --env PGPASSWORD="$KOVA_POSTGRES_PASSWORD" --volume /var/backups/kova/kova-REPLACE.dump:/restore.dump:ro postgres:16.15-alpine3.24@sha256:3c5c8892d184f738f4fe282d14ddaa613a38f00f4189d2d94725ebe6f2909ddb pg_restore --host=kova-postgres-restore --username=kova --dbname=kova --clean --if-exists --no-owner /restore.dump
docker run --rm --network kova-restore --env KOVA_DATABASE_URL="postgresql://kova:$KOVA_POSTGRES_PASSWORD@kova-postgres-restore:5432/kova" <verified-backend-image> npm run backend:reconcile
docker rm --force kova-postgres-restore
docker network rm kova-restore
```

The restore target must be isolated from the live `postgres` service. Record
the restored report hash and recovery time before approving a release. Replace
`<verified-backend-image>` with the exact image digest selected for the
rehearsal; do not use an unverified local tag.

To roll back the backend, retain the previous image digest and compose
configuration, stop only the backend service, start that exact image, and
re-run the health and reconciliation checks. Do not roll back the database
volume and backend image independently unless the recorded migration version
and backup restore have both been reviewed.

From a checkout with the server-only URL configured, the repository-owned
check applies the same schema and preview-capability guard:

```bash
KOVA_BACKEND_API_URL=https://api.kova.surf npm run check:vm
```

It exits non-zero for an unreachable, malformed, or financially enabled
backend. This is a read-only verification and does not prepare or submit a
transaction.

After the owner has deployed both surfaces, verify the complete preview link:

```bash
KOVA_PUBLIC_URL=https://kova.surf KOVA_BACKEND_API_URL=https://api.kova.surf npm run verify:preview
```

This checks the frontend disclosure, the frontend-to-VM server route, VM
liveness, VM readiness and VM capability disclosure. It fails if admission or
any financial execution capability is reported as enabled. Keep the JSON
receipt with the matching clean `npm run prove:release` manifest.

`/api/live` proves only that the process can answer HTTP. `/api/ready` proves
the configured runtime can serve its current mode; in preview it explicitly
reports `readyToAdmit=false` and `readyToRecover=false`. In durable mode it
also checks PostgreSQL and all four checksummed migrations. `/api/health`
remains the capability disclosure. A green container does not authorize a
financial capability, Dealer admission, settlement, or payout.

The frontend health check requires `KOVA_BACKEND_API_URL` in the Vercel
server environment. It validates the VM health response through the same
server-only contract used by market detail pages.

Back up the PostgreSQL volume through the VM's approved backup process before
calling the deployment release-ready. Restore into a separate volume and run
the reconciliation proof before replacing the live volume.

The backend container runs read-only, without Linux capabilities, with
`no-new-privileges`, bounded CPU/memory, a private temporary filesystem and a
35-second graceful-stop window. On shutdown it stops reconciliation, stops
accepting HTTP, drains requests for at most 30 seconds, then closes database
pools. An exit after forced draining or a failed pool close is unhealthy and
must be investigated before restart.

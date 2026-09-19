# FLOAT VM deployment recipe

This recipe runs the KOVA Hono backend and PostgreSQL on an owner-controlled
VM. The backend is not published directly. The existing ArcRun/Agon Caddy is
the only public service; PostgreSQL is reachable only on KOVA's private Docker
network.


## Ingress

This project publishes no ports and ships no Caddy. The ArcRun/Agon compose
project owns 80 and 443 on this host, and KOVA borrows it: the backend joins
that project's default network as `kova-api`, and the `api.kova.surf` site
block lives in the Agon repository at `deploy/caddy/Caddyfile`.

Never run `docker compose down` in the Agon directory. It deletes the shared
network and takes this service down with it. Use `up -d`, or restart
individual services.

After changing the site block, Caddy needs an explicit reload:

```bash
docker exec arcrun-caddy caddy reload --config /etc/caddy/Caddyfile
```

## Before the first start

1. Install Docker Engine and Compose on the VM.
2. Choose the API hostname and an approved HTTPS Solana RPC endpoint.
3. Create a VM-only environment file outside Git with these values:

```text
KOVA_ALLOWED_ORIGINS=https://kova.surf
KOVA_SOLANA_RPC_URL=https://your-approved-rpc.example
KOVA_POSTGRES_PASSWORD=replace-with-a-long-random-value
KOVA_RECONCILIATION_INTERVAL_SECONDS=300
```

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
curl --fail https://api.example.com/api/health
docker compose restart backend
curl --fail https://app.example.com/api/backend-health
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
docker run --detach --name kova-postgres-restore --network kova-restore --env POSTGRES_DB=kova --env POSTGRES_USER=kova --env POSTGRES_PASSWORD="$KOVA_POSTGRES_PASSWORD" postgres:16-alpine
until docker exec kova-postgres-restore pg_isready -U kova -d kova; do sleep 2; done
docker run --rm --network kova-restore --env PGPASSWORD="$KOVA_POSTGRES_PASSWORD" --volume /var/backups/kova/kova-REPLACE.dump:/restore.dump:ro postgres:16-alpine pg_restore --host=kova-postgres-restore --username=kova --dbname=kova --clean --if-exists --no-owner /restore.dump
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
KOVA_BACKEND_API_URL=https://api.example.com npm run check:vm
```

It exits non-zero for an unreachable, malformed, or financially enabled
backend. This is a read-only verification and does not prepare or submit a
transaction.

The health response must still report preview mode and unavailable signing,
transaction preparation, rewards, and automated rebalancing. A green container
does not authorize a financial capability.

The frontend health check requires `KOVA_BACKEND_API_URL` in the Vercel
server environment. It validates the VM health response through the same
server-only contract used by market detail pages.

Back up the PostgreSQL volume through the VM's approved backup process before
calling the deployment release-ready. Restore into a separate volume and run
the reconciliation proof before replacing the live volume.

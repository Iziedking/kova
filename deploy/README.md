# FLOAT VM deployment recipe

This recipe runs the Hono backend, PostgreSQL, and Caddy on an owner-controlled
VM. The backend is not published directly. Caddy is the only public service;
PostgreSQL is reachable only on the private Docker network.

## Before the first start

1. Install Docker Engine and Compose on the VM.
2. Choose the API hostname and an approved HTTPS Solana RPC endpoint.
3. Create a VM-only environment file outside Git with these values:

```text
FLOAT_API_DOMAIN=api.example.com
FLOAT_ALLOWED_ORIGINS=https://app.example.com
FLOAT_SOLANA_RPC_URL=https://your-approved-rpc.example
FLOAT_POSTGRES_PASSWORD=replace-with-a-long-random-value
FLOAT_RECONCILIATION_INTERVAL_SECONDS=300
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
mkdir -p /var/backups/float
docker compose exec -T postgres sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump --username=float --dbname=float --format=custom --no-owner --file=-' > /var/backups/float/float-$(date -u +%Y%m%dT%H%M%SZ).dump
```

For a restore rehearsal, create a separate PostgreSQL container or volume and
an explicitly named isolated network. Restore the dump there, apply the same
migration if required, and run the read-only reconciliation proof from a
container on that network before replacing anything live:

```bash
docker network create float-restore
docker run --detach --name float-postgres-restore --network float-restore --env POSTGRES_DB=float --env POSTGRES_USER=float --env POSTGRES_PASSWORD="$FLOAT_POSTGRES_PASSWORD" postgres:16-alpine
until docker exec float-postgres-restore pg_isready -U float -d float; do sleep 2; done
docker run --rm --network float-restore --env PGPASSWORD="$FLOAT_POSTGRES_PASSWORD" --volume /var/backups/float/float-REPLACE.dump:/restore.dump:ro postgres:16-alpine pg_restore --host=float-postgres-restore --username=float --dbname=float --clean --if-exists --no-owner /restore.dump
docker run --rm --network float-restore --env FLOAT_DATABASE_URL="postgresql://float:$FLOAT_POSTGRES_PASSWORD@float-postgres-restore:5432/float" <verified-backend-image> npm run backend:reconcile
docker rm --force float-postgres-restore
docker network rm float-restore
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
FLOAT_BACKEND_API_URL=https://api.example.com npm run check:vm
```

It exits non-zero for an unreachable, malformed, or financially enabled
backend. This is a read-only verification and does not prepare or submit a
transaction.

The health response must still report preview mode and unavailable signing,
transaction preparation, rewards, and automated rebalancing. A green container
does not authorize a financial capability.

The frontend health check requires `FLOAT_BACKEND_API_URL` in the Vercel
server environment. It validates the VM health response through the same
server-only contract used by market detail pages.

Back up the PostgreSQL volume through the VM's approved backup process before
calling the deployment release-ready. Restore into a separate volume and run
the reconciliation proof before replacing the live volume.

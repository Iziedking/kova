# KOVA API deployment

The API (https://api.kova.surf) and its PostgreSQL database run as the Docker Compose project `kova` on a shared VM. The frontend (https://kova.surf) is a separate Vercel deployment. Pushes to `main` deploy it through CI ([../docs/cicd.md](../docs/cicd.md)). This page covers the pieces on the VM and how to operate them by hand.

## Files

| File | Role |
| --- | --- |
| `backend.Dockerfile` | Node 24 image for the API and migrations; includes the program IDL |
| `docker-compose.yml` | `postgres`, `migrate`, `backend` (`kova-api`). The VM uses its own reviewed copy at `~/kova-deploy/docker-compose.yml` |
| `host-deploy.sh` | Installed as `~/kova-deploy/bin/deploy.sh`, the only command the CI key can run |
| `shared-ingress.caddy` | The `api.kova.surf` site block for the shared Caddy, exposing only `/api/*` |

## Shared host rules

The VM also runs other projects. The ArcRun/Agon Compose project owns ports 80 and 443 and its Caddy is the only ingress. KOVA publishes no ports. `kova-api` joins that project's `deploy_default` network, and the database sits on a private internal network under the alias `kova-postgres` (the bare name `postgres` can resolve to another project's database on the shared network).

Never run `docker compose down` in the Agon directory; it removes the shared network. The `api.kova.surf` block must live in Agon's tracked Caddyfile, because Agon's deploy resets that checkout. After changing it:

```bash
docker exec arcrun-caddy caddy validate --config /etc/caddy/Caddyfile
docker exec arcrun-caddy caddy reload --config /etc/caddy/Caddyfile
```

## Configuration

Two env files outside Git, both mode 0600: `~/kova-secrets/kova.vm.env` (database password, Privy, pick key, chain, Dealer model) and `~/kova-secrets/clawpump.env` (ClawPump key and agent id). The operator, oracle and admission keypairs are mounted read-only from `KOVA_KEYS_DIR`. The program upgrade key is kept outside that directory and never mounted. Every variable is listed in [../.env.example](../.env.example).

## Operate

```bash
cd ~/kova-deploy/current/deploy
sudo docker compose -p kova --env-file ~/kova-secrets/kova.vm.env --env-file ~/kova-secrets/clawpump.env ps
sudo docker compose -p kova --env-file ~/kova-secrets/kova.vm.env --env-file ~/kova-secrets/clawpump.env logs --tail=100 backend
curl --fail https://api.kova.surf/api/ready
```

Redeploy a commit that is already on `main`, or roll back to an earlier one:

```bash
~/kova-deploy/bin/deploy.sh "deploy <40-character commit sha>"
```

After editing an env file, redeploy the current commit (`cat ~/kova-deploy/REVISION`) the same way.

## Backup and restore

```bash
mkdir -p /var/backups/kova
sudo docker exec kova-postgres-1 sh -lc 'pg_dump --username=kova --dbname=kova --format=custom --no-owner' > /var/backups/kova/kova-$(date -u +%Y%m%dT%H%M%SZ).dump
```

Restore into a separate container on an isolated network, run `npm run backend:reconcile` against it, and time the whole rehearsal before replacing anything live. Migrations are append-only, so an older backend image runs against a newer schema; never roll the database back on its own.

## Health

| Endpoint | Meaning |
| --- | --- |
| `/api/live` | The process answers HTTP |
| `/api/ready` | Database and all migrations are ready |
| `/api/health` | Capability disclosure, labelled by network (`devnet_live` and similar) |

The container runs read-only, drops every Linux capability, sets `no-new-privileges`, is limited to 1 CPU and 768 MB, and drains requests for up to 30 seconds on shutdown.

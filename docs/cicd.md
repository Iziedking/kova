# KOVA CI/CD

One push to `main` ships both halves:

| Half | What happens on a push to `main` |
| --- | --- |
| Frontend | Vercel's Git integration builds and promotes the commit to production at https://kova.surf and https://www.kova.surf. |
| Backend | GitHub Actions `Verify KOVA` runs every check, then `deploy-backend` deploys that exact commit to the VM behind https://api.kova.surf. |

Pushes to other branches run the checks only. Vercel gives them preview URLs; the VM is untouched.

## Backend path

1. `verify` runs `npm ci`, `npm run check` and `npm run test:postgres-game`. Nothing deploys if any step fails.
2. `deploy-backend` connects with a dedicated SSH key and sends one line: `deploy <commit sha>`.
3. On the VM, that key's forced command is `~/kova-deploy/bin/deploy.sh` (a copy of [`deploy/host-deploy.sh`](../deploy/host-deploy.sh)). It:
   - fetches the commit from GitHub itself and refuses it unless it is on `main`;
   - builds it with the reviewed compose file kept at `~/kova-deploy/docker-compose.yml`, never the one inside the commit;
   - runs migrations, starts the new container and waits for Docker health plus `https://api.kova.surf/api/ready`;
   - keeps the three newest releases and rolls back to the previous one if the new one is not healthy.
4. The job finally checks `/api/ready` from GitHub's side.

The deploy key is registered with `restrict` and the forced command. It cannot open a shell, forward ports or run any other command (verified 2026-09-28).

## One-time setup

GitHub repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `KOVA_DEPLOY_SSH_KEY` | Private half of the VM's `kova-ci-deploy` key |
| `KOVA_DEPLOY_KNOWN_HOSTS` | `ssh-keyscan -t ed25519 3.96.102.139`; fingerprint `SHA256:9hiq94Pvmh68djj3shq9DSv7sT1MOzgHEM3XbjOuKZY` |
| `KOVA_DEPLOY_HOST` | `3.96.102.139` |

Vercel production environment variables on project `kova`:

| Variable | Kind |
| --- | --- |
| `KOVA_BACKEND_API_URL=https://api.kova.surf` | server only |
| `NEXT_PUBLIC_KOVA_DATA_SOURCE=api` | public by design |
| `NEXT_PUBLIC_PRIVY_APP_ID` | public by design |
| `PRIVY_APP_SECRET` | sensitive, server only |

Backend secrets never leave the VM: `~/kova-secrets/kova.vm.env`, `~/kova-secrets/clawpump.env` and the signing keys in `~/kova-secrets/devnet/`.

## Changing things that CI does not deploy

- `deploy/docker-compose.yml`: a commit that changes it prints a NOTICE in the deploy log. Review it, then copy it to `~/kova-deploy/docker-compose.yml` on the VM by hand.
- `deploy/host-deploy.sh`: copy it to `~/kova-deploy/bin/deploy.sh` by hand after review.
- Server secrets: edit the files in `~/kova-secrets/`, then push any commit, or run `deploy.sh "deploy <current sha>"` on the VM.

## Rollback

Revert the bad commit and push. For an immediate rollback, run `~/kova-deploy/bin/deploy.sh "deploy <previous sha>"` on the VM; the previous three releases are kept. Migrations are append-only, so an older backend runs against a newer schema.

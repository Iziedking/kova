#!/usr/bin/env bash
# KOVA backend deploy, run on the VM as the forced command of the CI deploy key.
#
# The CI key can only send "deploy <40-char sha>". This script fetches that exact commit
# from GitHub itself, refuses anything not on main, builds it, waits for health, and rolls
# back to the previous release if the new one is not healthy.
#
# The compose file decides host mounts and networks, so the reviewed copy installed at
# $ROOT/docker-compose.yml is always used, never the one inside the commit.
set -euo pipefail

ROOT=/home/ubuntu/kova-deploy
SECRETS=/home/ubuntu/kova-secrets
REPO=https://github.com/Iziedking/kova.git
PUBLIC_READY=https://api.kova.surf/api/ready

exec 9>"$ROOT/.deploy.lock"
flock -n 9 || { echo "Another deploy is running."; exit 75; }

request="${SSH_ORIGINAL_COMMAND:-${1:-}}"
[[ "$request" =~ ^deploy\ ([0-9a-f]{40})$ ]] || { echo "Expected: deploy <40-char commit sha>"; exit 64; }
sha="${BASH_REMATCH[1]}"

mirror="$ROOT/mirror.git"
[ -d "$mirror" ] || git clone --quiet --bare "$REPO" "$mirror"
git -C "$mirror" fetch --quiet --prune origin '+refs/heads/main:refs/heads/main'
git -C "$mirror" merge-base --is-ancestor "$sha" refs/heads/main || { echo "Commit $sha is not on main; refusing."; exit 65; }

release="$ROOT/releases/$sha"
if [ ! -d "$release" ]; then
  rm -rf "$release.tmp"
  mkdir -p "$release.tmp"
  git -C "$mirror" archive "$sha" | tar -x -C "$release.tmp"
  mv -T "$release.tmp" "$release"
fi
if ! cmp -s "$release/deploy/docker-compose.yml" "$ROOT/docker-compose.yml"; then
  echo "NOTICE: this commit changes deploy/docker-compose.yml. The reviewed host copy was used; update $ROOT/docker-compose.yml by hand."
fi
cp "$ROOT/docker-compose.yml" "$release/deploy/docker-compose.yml"

compose() {
  local dir="$1"; shift
  sudo -n docker compose -p kova --project-directory "$dir/deploy" -f "$dir/deploy/docker-compose.yml" \
    --env-file "$SECRETS/kova.vm.env" --env-file "$SECRETS/clawpump.env" "$@"
}

healthy() {
  for _ in $(seq 1 60); do
    if [ "$(sudo -n docker inspect -f '{{.State.Health.Status}}' kova-api 2>/dev/null)" = healthy ] \
      && curl -fsS -m 10 "$PUBLIC_READY" >/dev/null; then
      return 0
    fi
    sleep 5
  done
  return 1
}

previous="$(readlink -f "$ROOT/current" 2>/dev/null || true)"
echo "Deploying $sha"
if compose "$release" up -d --build && healthy; then
  ln -sfn "$release" "$ROOT/current"
  echo "$sha" > "$ROOT/REVISION"
  # Keep the three newest releases for rollback.
  ls -1dt "$ROOT"/releases/*/ 2>/dev/null | tail -n +4 | xargs -r rm -rf
  echo "Deployed $sha"
  exit 0
fi

echo "Deploy of $sha failed its health checks."
if [ -n "$previous" ] && [ "$previous" != "$release" ] && [ -d "$previous" ]; then
  echo "Rolling back to $(basename "$previous")"
  cp "$ROOT/docker-compose.yml" "$previous/deploy/docker-compose.yml"
  compose "$previous" up -d --build && healthy && echo "Rolled back to $(basename "$previous")."
fi
exit 1

#!/bin/sh
set -eu

# Runs inside the pinned Node 24 image with the repository mounted read-only at /src.
apk add --no-cache git
mkdir -p /work
cd /src
tar \
  --exclude=./node_modules \
  --exclude=./.next \
  --exclude=./.git \
  --exclude=./.internal \
  --exclude=./target \
  --exclude=./test-results \
  --exclude=./playwright-report \
  -cf - . | tar -xf - -C /work
cd /work
export GIT_DIR=/src/.git
export GIT_WORK_TREE=/work
npm ci
npm run check

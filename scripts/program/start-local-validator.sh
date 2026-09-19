#!/usr/bin/env bash
set -euo pipefail

program_id="AJeX3fo46PTu6StNorvkSatRwXLKAvfZpDv6PAzJVCjj"
program_binary="target/deploy/kova_game.so"

if [[ ! -f "$program_binary" ]]; then
  echo "Missing $program_binary. Run scripts/program/build.sh first." >&2
  exit 1
fi

exec solana-test-validator \
  --reset \
  --ledger test-ledger \
  --rpc-port 8899 \
  --faucet-port 9900 \
  --bpf-program "$program_id" "$program_binary"

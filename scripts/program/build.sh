#!/usr/bin/env bash
set -euo pipefail

required_anchor="anchor-cli 1.2.0"
required_solana="solana-cli 4.1.2"

if [[ "$(anchor --version)" != "$required_anchor" ]]; then
  echo "Expected $required_anchor." >&2
  exit 1
fi

if [[ "$(solana --version | cut -d' ' -f1-2)" != "$required_solana" ]]; then
  echo "Expected $required_solana." >&2
  exit 1
fi

mkdir -p target/deploy
cargo build-sbf \
  --tools-version v1.54 \
  --manifest-path programs/kova_game/Cargo.toml \
  --sbf-out-dir target/deploy
anchor idl build -p kova_game

echo "Built target/deploy/kova_game.so and target/idl/kova_game.json."

# KOVA program

`kova_game` is the Anchor program that holds every stake. It is deployed to Solana devnet at `AJeX3fo46PTu6StNorvkSatRwXLKAvfZpDv6PAzJVCjj` (see [devnet.md](devnet.md)) and has not been deployed to mainnet or independently reviewed.

Program instructions: `initialize_table`, `join_table`, `lock_table`, `record_start`, `activate_table`, `record_result`, `finalize_result`, `void_expired_table`, `claim_payout`, `claim_refund`.

## What the program enforces

- two to six funded wallets and one entry PDA per wallet per table;
- equal integer stake amounts with a hard ceiling of 10,000,000 raw units;
- a six-decimal Token-2022 stake mint with no mint or freeze authority;
- a mint-extension allowlist limited to metadata pointer and token metadata;
- a Dealer admission co-signature on each funded entry;
- private commitment and sealed-market hashes before the round;
- oracle-signed start/end observations, bounded integer prices and on-chain signed-bps scoring;
- exact sorted roster and start-evidence digest verification before settlement;
- deterministic winner allocation with decoded-wallet-byte remainder order;
- program-vault payouts, replay refusal, and permissionless timeout cancellation/refunds;
- pot accounting based on funded stakes, excluding unsolicited vault transfers.

The program does not prove that an oracle price is honest, that a mint is the organizer's canonical ANSEM asset, or that a paid competition is legally available. Those remain release gates. The model does not price, score, settle, sign, or move funds.

The reviewed IDL and generated TypeScript type are pinned under `idl/`. Deployment keypairs and validator ledgers are never committed.

## Pinned toolchain

- Anchor CLI and crates: 1.2.0
- Solana CLI and local validator: 4.1.2
- SBF platform tools: v1.54, selected explicitly because this Solana builder reports it as its supported default
- program MSRV: Rust 1.89 (builds use 1.91)

Installing Anchor 1.2.0 through `avm` also installs Solana 3.1.10 and makes it the active release. Put the 4.1.2 release directory first on `PATH` before building; `scripts/program/build.sh` refuses any other version. The 4.1.2 test validator needs `io_uring`, which Docker's default seccomp profile blocks, so run it natively rather than in a container.

Run the build in Linux or WSL:

```text
bash scripts/program/build.sh
```

Start the isolated validator in terminal one:

```text
bash scripts/program/start-local-validator.sh
```

Run the client proof in terminal two:

```text
npm run test:program-client
```

The proof creates disposable local keys and a test Token-2022 mint, then exercises deposits, settlement, claims, duplicate-join refusal, payout replay refusal, an unsupported transfer-fee mint, unsolicited vault tokens, permissionless timeout, and refunds. It never contacts devnet or mainnet.

## Measured local-validator envelope

The two-player proof on Solana validator 4.1.2 (rebuilt 2026-09-27, `kova_game.so` sha256 `0b9e8450…1f7d`) measured a largest legacy transaction of 570 bytes and at most 24,259 compute units. Six-player finalization has not been measured yet.

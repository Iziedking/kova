# KOVA program

KOVA's M2 program is a local-validator release candidate for bounded Token-2022 escrow. It is not deployed to devnet or mainnet.

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

Program ID used by the local artifact:

```text
AJeX3fo46PTu6StNorvkSatRwXLKAvfZpDv6PAzJVCjj
```

The reviewed IDL and generated TypeScript type are pinned under `idl/`. Deployment keypairs and validator ledgers are never committed.

## Pinned toolchain

- Anchor CLI and crates: 1.2.0
- Solana CLI and local validator: 4.1.2
- SBF platform tools: v1.54, selected explicitly because this Solana builder reports it as its supported default
- program MSRV: Rust 1.89

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

The final two-player proof on Solana validator 4.1.2 measured a maximum serialized legacy transaction size of 570 bytes and a maximum simulation result of 21,221 compute units. These are local measurements, not production guarantees. Six-player finalization and the approved deployment environment must be measured again before deployment.

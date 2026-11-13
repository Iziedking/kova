# Deploying CHIP

The contract is deployed once per account and set up in the same transaction. There is no
migrate or upgrade method, so a new version goes to a new account. The settler and the House are
ordinary accounts and are reused.

| Version | Account | What changed |
| --- | --- | --- |
| 1 | `chip.kingizie.testnet` | Pot burn, daily call, blinds, starter claim, the House. 5 tables settled on 2026-11-12; kept as history. |
| 2 | `chip-v2.kingizie.testnet` | Version 1 plus clans and the daily clan race (`create_clan`, `join_clan`, `leave_clan`, and the weighted daily share). |

## Build and check

On the VPS through the resource guard (never on a laptop):

```bash
node .izie/hooks/test-resource-guard.cjs --run chip-lint
node .izie/hooks/test-resource-guard.cjs --run chip-unit
node .izie/hooks/test-resource-guard.cjs --run chip-sandbox
node .izie/hooks/test-resource-guard.cjs --run chip-build
```

`near/chip/res/kova_chip.wasm` is the build that is deployed. Check its hash before deploying:

```bash
sha256sum near/chip/res/kova_chip.wasm
```

## Deploy version 2 (near-cli-rs, signed by the parent account)

1. Create the account under `kingizie.testnet`, funded for the code's storage (about 3.5 NEAR for
   340 KB of wasm, plus state as tables and holders grow):

```bash
near account create-account fund-myself chip-v2.kingizie.testnet '8 NEAR' autogenerate-new-keypair save-to-keychain sign-as kingizie.testnet network-config testnet sign-with-keychain send
```

2. Deploy and initialise in one transaction. `near/chip/deploy/testnet-init.json` holds every
   parameter, including the clan ones (founding burns 100 CHIP, 50 members, top clan weight 2):

```bash
near contract deploy chip-v2.kingizie.testnet use-file near/chip/res/kova_chip.wasm with-init-call new file-args near/chip/deploy/testnet-init.json prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
```

3. Read it back:

```bash
near contract call-function as-read-only chip-v2.kingizie.testnet get_config json-args {} network-config testnet now
near contract call-function as-read-only chip-v2.kingizie.testnet get_stats json-args {} network-config testnet now
```

## Point the app at it

- Backend (VM): set `NEAR_CHIP_CONTRACT=chip-v2.kingizie.testnet` in `~/kova-secrets/kova.vm.env`
  and redeploy.
- Frontend: the default in `src/adapters/near/contract.ts` is the live contract. Vercel needs no
  change unless `NEXT_PUBLIC_NEAR_CHIP_CONTRACT` is set there.
- Proof script: `CHIP_LIVE_CONTRACT` defaults to the same value.

## Lock it

Removing the account's full-access key makes the code permanent. It is the owner's decision and
cannot be undone. Until then the token page says the key is still held.

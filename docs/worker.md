# KOVA worker and result boundary

M5 worker infrastructure is implemented locally but value-bearing orchestration is not enabled.

## Implemented

- PostgreSQL jobs use `FOR UPDATE SKIP LOCKED`, expiring leases, monotonically increasing fence epochs, bounded attempts, and stable operation keys.
- A restarted worker can reclaim an expired lease. The stale worker cannot complete the reclaimed job.
- Capture plans are immutable per table and hash their provider, timing bounds, fallback rule, and exact pair bindings.
- A pair/phase accepts only one price sample. An identical retry is a replay; a changed price, raw-response hash, or policy is a conflict.
- Capture validation enforces the exact target, request deadline, bounded fallback, and cross-pair skew. It does not invent an upstream timestamp.
- Result manifests are canonical, hashable, and independently recompute commitments, sealed market bindings, scores, winners, and exact pot entitlements before a signer could accept them.
- Chain operation intent is written before submission. `unknown` is a first-class state; a retry must preserve the exact message hash and signature identity.
- Public/principal events have monotonic replay cursors. Public event payloads use a strict allowlist that excludes picks, mints, pairs, commitments, evidence, prices, and scores.

## Still blocked

There is no enabled production capture provider, oracle signer, relayer, approved program deployment, canonical ANSEM confirmation, or value-bearing legal approval. The observed-mark preview policy is not an accepted money-pricing policy. Consequently no worker process submits transactions and no API claims settlement is live.

M5 completion still requires an owner-approved environment where three separately controlled wallets reach actual claims, plus kill/restart, delayed-provider, unknown-signature, and timeout-refund evidence against the deployed program. Local job and manifest tests do not substitute for that gate.


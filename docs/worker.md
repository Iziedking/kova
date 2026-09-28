# KOVA settlement worker

The worker runs inside the API process. It leases one PostgreSQL job at a time and drives each table through the program's deadlines ([`chain-game.ts`](../src/backend/game/chain-game.ts)).

## Jobs

| Job | Scheduled | What it does |
| --- | --- | --- |
| `capture_start` | When the last seat is funded | `lock_table`, capture every pick's mark concurrently, `record_start` per entry, `activate_table` within the program's 120 s window |
| `capture_end` | Round end plus 1.5 s | Capture closing marks, `record_result` per entry, `finalize_result`, publish the showdown |
| `expire_table` | Open, locking and settlement deadlines | Call the permissionless `void_expired_table` when a deadline passed, so players can refund |

## Recovery

- Leases use `FOR UPDATE SKIP LOCKED`, expiring leases and fencing epochs. A restarted worker reclaims an expired job; the stale worker cannot complete it.
- Every step checks chain state first. A retried `capture_start` skips entries whose start is already recorded, builds the start digest from the leaves the chain stored, and schedules settlement if activation already landed.
- The oracle and operator sign; players never depend on them to get money back. If the worker is down past a deadline, anyone can void the table and each player claims a refund.
- Chain operations are recorded before submission, and a transaction is simulated before it is sent.

## Prices

Marks come from DEX Screener's pair endpoint for the exact pair bound in the player's commitment. A pair quoting a different base token, a missing price, or a non-positive price fails the capture instead of defaulting. DEX Screener reports no source timestamp, so KOVA records its own request window and the raw response hash. This is the observed-mark model listed as a mainnet gate in [release-status.md](release-status.md).

## Events

Public events are `table.opened`, `table.funded`, `table.active`, `table.settled` and `table.refundable`. Their payloads pass a strict allowlist. Picks and scores appear only in `table.settled`, after the chain has settled.

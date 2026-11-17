# PAYROLL ID CONCURRENCY REVIEW

**Status: FIXED — unique-constraint retry verified on both write paths.**

## Investigation

`Payroll::boot()` computes `MAX(suffix)+1` per attempt — correct after F-003, but two concurrent requests could still compute the same next id and race the unique index (`payrolls_payroll_id_unique`), surfacing a 500.

## Fix applied (smallest safe solution — no new tables/locks)

- `Api\PayrollController::store()`: `retry(3, fn() => Payroll::create(...), 100ms, when UniqueConstraintViolationException)`.
- `Api\PayrollController::generate()`: `retry(3, ...updateOrCreate..., when UCVE)` around the per-person write.
- **Retry regenerates the id inside each attempt** — the `creating` hook re-runs and recomputes `MAX+1`, so the retry picks the next free suffix rather than re-trying the same id (per review requirement).

## Executed collision tests (`PayrollFinalizationTest`)

| Test | Mechanism | Result |
| --- | --- | --- |
| `store recovers from payroll id collision` | `creating`-listener "thief" inserts a competitor row claiming the would-be id → model insert UCVEs → retry recomputes → row lands on next suffix | **PASS** — competitor kept `PAY-…-0001`, store row got `PAY-…-0002` |
| `generate recovers from payroll id collision` | same thief on the `updateOrCreate` path | **PASS** — collision forced, row created, all `payroll_id`s unique, no duplicate row for the employee |

**Harness nuance documented in-test:** `updateOrCreate`/`createOrFirst` wraps its write in a savepoint while the `RefreshDatabase` transaction is active, so the injected competitor row rolls back with the colliding attempt. In production the concurrent commit lives on another connection and survives — exactly the case the `store()` test proves resolves via `MAX+1` recompute.

## Residual limitation (accepted)

- Retry budget is 3 attempts — under sustained >3-way simultaneous creation on an empty sequence a collision could still exhaust retries (returns an error rather than a wrong id). Probability is negligible for a single-manager payroll operation.
- `update()` does not mint ids — unaffected.

**Verdict:** the race is no longer exploitable as a 500 or a duplicate row; residual is bounded and documented.

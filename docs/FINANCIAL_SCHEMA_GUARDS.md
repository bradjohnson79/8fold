# Financial Schema Guards

Permanent CI guardrails to prevent financial schema drift. Production uses `public` schema only.

## Rule: No 8fold_test in Runtime or New Migrations

- **Runtime code** must never hardcode `8fold_test`. Use `getResolvedSchema()` or Drizzle.
- **New migrations** (0068+) must target `public` only. Historical migrations grandfathered.

## CI Guard

`scripts/financial-schema-guard.sh` — fails if runtime or new migrations contain `8fold_test`.

## Usage

```bash
pnpm guard:financial-schema
```

## Integration

- `package.json`: `guard:financial-schema`
- `scripts/ci-gate.mjs`: invoked before `ai:guard`

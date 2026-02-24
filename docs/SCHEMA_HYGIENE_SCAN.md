# Schema Hygiene Diagnostic Scan

Read-only diagnostic: Drizzle schema vs production database alignment. No modifications. No migrations.

## Usage

```bash
pnpm -C apps/api schema:hygiene
```

Requires `DATABASE_URL` in `apps/api/.env.local`.

## Outputs

| Report | Description |
|--------|-------------|
| `reports/db_structure_snapshot.json` | Tables, enums, FKs, indexes, NOT NULL, defaults from DB |
| `reports/drizzle_schema_snapshot.json` | Parsed Drizzle schema (tables, columns, enums) |
| `reports/schema_drift_report.json` | Detected drift (missing/extra tables, columns, type mismatches) |
| `reports/schema_drift_ranked.md` | Drift ranked by severity (CRITICAL/HIGH/MEDIUM/LOW) |
| `reports/query_integrity_report.md` | Query file scan (columns, tables, joins) |

## Severity Weights (Health Score)

- **CRITICAL** (-25): Missing table, missing column, enum mismatch, type mismatch
- **HIGH** (-10): Nullable mismatch, wrong default
- **MEDIUM** (-3): Extra column, extra enum label
- **LOW** (-1): Extra table, index mismatch

**Health Score** = `max(0, 100 - penalty)`

## Rules

- Do not modify database
- No migrations generated
- Read-only diagnostic

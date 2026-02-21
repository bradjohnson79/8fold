# JobDraftV2 Production Enablement

This runbook ensures `JobDraftV2` is available in the same schema the API uses at runtime.

## 1) Verify deployed build metadata

API host:

```bash
curl -sS "https://<api-host>/api/diag/build" | jq
```

Web proxy host:

```bash
curl -sS "https://8fold.app/api/app/diag/build" | jq
```

Expected:

- `commitSha` matches latest `main`
- `runtimeSchema` matches your intended runtime schema (for this incident: `8fold_test`)
- `dbSchemaParamValue` matches your intended runtime schema (for this incident: `8fold_test`)

## 2) Diagnose production DB schema state

Run with production DB URL:

```bash
DATABASE_URL="<production DATABASE_URL>" pnpm exec tsx scripts/diagnose-jobdraftv2-prod.ts
```

Expected:

- `EXPECTED_SCHEMA=<intended schema>` (for this incident: `8fold_test`)
- `TABLES_OK=true`
- `ENUMS_OK=true`
- `MISSING_COLUMNS=[]`

## 3) Apply migrations if missing

If tables/enums/columns are missing:

```bash
DATABASE_URL="<production DATABASE_URL>" pnpm db:migrate
```

The migration runner uses `?schema=` from `DATABASE_URL` and sets `search_path` to `"<schema>", public` before applying SQL files.
If `?schema=` is missing, runtime defaults to `public`.

## 4) Verify endpoint behavior

```bash
curl -i "https://8fold.app/api/app/job-poster/drafts-v2/current"
```

Expected:

- `200` with `success: true` (authenticated request), or
- `401/403` (unauthenticated/unauthorized),
- never `500`.

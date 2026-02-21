# Job Post Wizard Stabilization

Date: 2026-02-21

## Decision

Legacy wizard runtime is permanently deprecated.

## Cutover behavior

- Canonical route is `"/app/job-poster/post-a-job"`.
- The alternate wizard route redirects to canonical.
- The legacy payment return route redirects to the canonical return handler.

## Deprecated API behavior

Legacy wizard API endpoints are intentionally kept as explicit deprecations and now return `410` with:

```json
{ "success": false, "code": "DEPRECATED_ENDPOINT" }
```

- Legacy draft create/update/read/delete handlers
- Legacy draft appraisal/step handlers
- Legacy payment verify/create-intent handlers used by the removed flow

## Data posture

- V1 data artifacts are retained for historical integrity.
- No runtime write path should target V1 draft endpoints.
- Future cleanup migration can remove obsolete V1 schema after production confirms zero reads/writes.

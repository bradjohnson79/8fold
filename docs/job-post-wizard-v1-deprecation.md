# Job Post Wizard V1 Deprecation

Date: 2026-02-21

## Decision

Job Post Wizard V1 is permanently deprecated. Job Poster traffic is now hard-cut to Wizard V2.

## Cutover behavior

- Canonical route is `"/app/job-poster/post-a-job-v2"`.
- Legacy `"/app/job-poster/post-a-job"` now hard-redirects to V2.
- Legacy `"/app/job-poster/payment/return"` now hard-redirects to `"/app/job-poster/payment/return-v2"`.

## Deprecated API behavior

The following legacy API endpoints are intentionally kept as explicit deprecations and now return `410` with:

```json
{ "success": false, "code": "DEPRECATED_ENDPOINT" }
```

- `POST /api/web/job-poster/drafts/save`
- `GET /api/web/job-poster/drafts/:id`
- `DELETE /api/web/job-poster/drafts/:id`
- `POST /api/web/job-poster/drafts/:id/start-appraisal`
- `POST /api/web/job-poster/drafts/:id/wizard-step`
- `POST /api/web/job-poster/payments/verify`
- `POST /api/web/job-poster/jobs/:id/create-payment-intent` (legacy flow)

## Data posture

- V1 data artifacts are retained for historical integrity.
- No runtime write path should target V1 draft endpoints.
- Future cleanup migration can remove obsolete V1 schema after production confirms zero reads/writes.

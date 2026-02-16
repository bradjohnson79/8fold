## Final E2E Proof (3 flows)

- Base: `http://localhost:3003`
- Generated: `2026-02-11T23:46:28.115Z`
- Result: **PASS**
- JobId: `0ac57fff-a8d0-4857-ba85-09fa886619f4`

### Steps

- **A1 drafts/save**: `POST http://localhost:3003/api/web/job-poster/drafts/save` → **200** PASS
- **A2 start-appraisal**: `POST http://localhost:3003/api/web/job-poster/drafts/0ac57fff-a8d0-4857-ba85-09fa886619f4/start-appraisal` → **200** PASS
- **A3 create-payment-intent**: `POST http://localhost:3003/api/web/job-poster/jobs/0ac57fff-a8d0-4857-ba85-09fa886619f4/create-payment-intent` → **200** PASS
- **A4 confirm-payment**: `POST http://localhost:3003/api/web/job-poster/jobs/0ac57fff-a8d0-4857-ba85-09fa886619f4/confirm-payment` → **200** PASS
- **A5 public-by-location**: `GET http://localhost:3003/api/public/jobs/by-location?country=CA&regionCode=BC&city=Langley` → **200** PASS
- **A6 my-jobs**: `GET http://localhost:3003/api/web/job-poster/jobs` → **200** PASS
- **B1 routable-jobs**: `GET http://localhost:3003/api/web/router/routable-jobs` → **200** PASS
- **B2 eligible-contractors**: `GET http://localhost:3003/api/jobs/0ac57fff-a8d0-4857-ba85-09fa886619f4/contractors/eligible` → **200** PASS
- **B3 apply-routing**: `POST http://localhost:3003/api/web/router/apply-routing` → **200** PASS
- **B4 routed-jobs**: `GET http://localhost:3003/api/web/router/routed-jobs` → **200** PASS
- **C1 contractor offers**: `GET http://localhost:3003/api/web/contractor/offers` → **200** PASS
- **C2 accept dispatch**: `POST http://localhost:3003/api/web/contractor/dispatches/0ac57fff-a8d0-4857-ba85-09fa886619f4/respond` → **200** PASS
- **C3 appointment GET**: `GET http://localhost:3003/api/web/contractor/appointment` → **200** PASS
- **C4 appointment POST**: `POST http://localhost:3003/api/web/contractor/appointment` → **200** PASS
- **C5 contractor conversations**: `GET http://localhost:3003/api/web/contractor/conversations` → **200** PASS

### Tables written (expected)

- **Flow A**: `Job`, `JobPayment`, `AuditLog`, `JobPhoto` (optional)
- **Flow B**: `JobDispatch`, `Job`, `AuditLog`
- **Flow C**: `JobDispatch`, `JobAssignment`, `Job`, `conversations`, `messages` (via appointment), `AuditLog`
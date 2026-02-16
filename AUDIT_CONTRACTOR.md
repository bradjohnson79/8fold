## Contractor Dashboard API Inventory (apps/web → apps/api)

This maps **Contractor** UI actions to:
- **Web app route** (`apps/web`) that calls the API
- **Web proxy API route** (`apps/web/src/app/api/app/contractor/**`) that forwards to backend
- **Backend API route** (`apps/api/app/api/web/contractor/**` and related)
- **Primary tables touched** (best-effort from backend route imports/usage)

### Notes discovered during inventory

- Several contractor-facing web proxies default to `http://localhost:3002` instead of `3003` (potential environment mismatch).
- `apps/web/src/app/app/contractor/jobs/page.tsx` is explicitly marked **placeholder**; production dashboard likely relies on **Offers/Active jobs** endpoints instead.

---

### Inventory table

| UI action | Frontend file(s) | Web endpoint | Web proxy route file | Upstream backend endpoint | Backend route file | Tables touched |
|---|---|---|---|---|---|---|
| Offers / dispatch inbox | contractor dashboard pages | `GET /api/app/contractor/offers` | `apps/web/src/app/api/app/contractor/offers/route.ts` | `GET /api/web/contractor/offers` | `apps/api/app/api/web/contractor/offers/route.ts` | `JobDispatch`, `Job`, `Contractor`, `User` |
| Accept/decline dispatch | offers UI | `POST /api/app/contractor/dispatches/:jobId/respond` | `apps/web/src/app/api/app/contractor/dispatches/[jobId]/respond/route.ts` | `POST /api/web/contractor/dispatches/:id/respond` | `apps/api/app/api/web/contractor/dispatches/[id]/respond/route.ts` (or legacy dispatch route) | `JobDispatch`, `Job`, `AuditLog`, `conversations` |
| Appointment proposal | `apps/web/src/app/app/contractor/AppointmentCard.tsx` | `GET/POST /api/app/contractor/appointment` | `apps/web/src/app/api/app/contractor/appointment/route.ts` | `GET/POST /api/web/contractor/appointment` | `apps/api/app/api/web/contractor/appointment/route.ts` | `Job`, `AuditLog`, `messages` |
| Contractor conversations list | contractor messaging UI | `GET /api/app/contractor/conversations` | `apps/web/src/app/api/app/contractor/conversations/route.ts` | `GET /api/web/contractor/conversations` | `apps/api/app/api/web/contractor/conversations/route.ts` | `conversations`, `messages` |
| Contractor conversation messages | contractor messaging UI | `GET/POST /api/app/contractor/conversations/:id/messages` | `apps/web/src/app/api/app/contractor/conversations/[conversationId]/messages/route.ts` | `GET/POST /api/web/contractor/conversations/:id/messages` | `apps/api/app/api/web/contractor/conversations/[id]/messages/route.ts` | `messages`, `conversations` |
| Notifications | contractor shell | `GET /api/app/contractor/notifications` + mark-read | `apps/web/src/app/api/app/contractor/notifications/*/route.ts` | `/api/web/contractor/notifications*` | `apps/api/app/api/web/contractor/notifications/*/route.ts` | `notification_deliveries` |
| Contractor profile | `apps/web/src/app/app/contractor/profile/page.tsx`, gates | `GET/POST /api/app/contractor/profile` | `apps/web/src/app/api/app/contractor/profile/route.ts` | `GET/POST /api/web/contractor/profile` | `apps/api/app/api/web/contractor/profile/route.ts` | `contractor_accounts`, `Contractor` |
| Waiver acceptance | `apps/web/src/app/app/contractor/waiver/page.tsx`, gates | `POST /api/app/contractor/waiver` | `apps/web/src/app/api/app/contractor/waiver/route.ts` | `POST /api/web/contractor-waiver` | `apps/api/app/api/web/contractor-waiver/route.ts` | `AuditLog`, contractor tables |
| Estimated completion updates | `apps/web/src/app/app/contractor/EstimatedCompletionCard.tsx` | `POST /api/app/contractor/estimated-completion` | `apps/web/src/app/api/app/contractor/estimated-completion/route.ts` | `POST /api/web/contractor/estimated-completion` | `apps/api/app/api/web/contractor/estimated-completion/route.ts` | `Job`, `AuditLog` |
| Repeat requests (view/respond) | `apps/web/src/app/app/contractor/repeat-requests/page.tsx` | `GET /api/app/contractor/repeat-requests` + `POST /api/app/contractor/repeat-requests/:jobId/respond` | `apps/web/src/app/api/app/contractor/repeat-requests/route.ts` + `apps/web/src/app/api/app/contractor/repeat-requests/[jobId]/respond/route.ts` | `/api/web/contractor/repeat-requests*` | `apps/api/app/api/web/contractor/repeat-requests*` | `RepeatContractorRequest`, `Job` |
| Incentives | `apps/web/src/app/app/contractor/incentives/page.tsx` | `GET /api/app/contractor/incentives` | `apps/web/src/app/api/app/contractor/incentives/route.ts` | `GET /api/web/contractor-incentives` | `apps/api/app/api/web/contractor-incentives/route.ts` | payout/earnings tables |
| Active jobs JSON (placeholder link) | `apps/web/src/app/app/contractor/jobs/page.tsx` | `GET /api/app/contractor/jobs` | `apps/web/src/app/api/app/contractor/jobs/route.ts` | `GET /api/web/contractor/jobs` | `apps/api/app/api/web/contractor/jobs/route.ts` | `Job`, assignment tables |
| Active job summary | contractor dashboard | `GET /api/app/contractor/jobs/active` | `apps/web/src/app/api/app/contractor/jobs/active/route.ts` | `GET /api/web/contractor/jobs/active` | `apps/api/app/api/web/contractor/jobs/active/route.ts` | `Job`, assignment tables |
| Job lifecycle: start/complete/release payment | contractor job UI | `/api/app/contractor/jobs/:jobId/start` `/complete` `/release-payment` | `apps/web/src/app/api/app/contractor/jobs/[jobId]/*/route.ts` | `/api/web/contractor/jobs/:id/*` | backend route(s) | `Job`, payments/materials tables |


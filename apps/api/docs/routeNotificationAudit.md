# Route-Level Notification Audit

Scope: route-level direct notification dispatches intentionally deferred from the domain-event refactor pass.

## Allowed direct route callers (temporary)

1. `app/api/webhooks/stripe/route.ts`
   - Uses legacy wrapper helpers for payment/refund admin and poster notifications.

2. `app/api/admin/notifications/send/route.ts`
   - Explicit admin bulk-send endpoint.

3. `app/api/web/job-poster/jobs/[id]/confirm-completion/route.ts`
   - Completion confirmation route currently dispatches directly.

4. `app/api/web/contractor/jobs/[id]/complete/route.ts`
   - Contractor completion route currently dispatches directly.

## Guard

`src/__tests__/routeNotificationGuard.test.ts` blocks new route-level direct notification calls outside this list.


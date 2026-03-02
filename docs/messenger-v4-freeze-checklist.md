# Messenger V4 Freeze Checklist (Phase 0)

Status: Inventory locked. No runtime behavior changes in this phase.

## Canonical Dashboard Messenger Entry Points
- apps/web/src/app/dashboard/contractor/messages/page.tsx
- apps/web/src/app/dashboard/job-poster/messages/page.tsx
- apps/web/src/components/roleShells/ContractorDashboardShellV4.tsx
- apps/web/src/components/roleShells/JobPosterDashboardShell.tsx

## Canonical V4 Messaging APIs
- apps/api/app/api/web/v4/contractor/messages/threads/route.ts
- apps/api/app/api/web/v4/contractor/messages/thread/[threadId]/route.ts
- apps/api/app/api/web/v4/contractor/messages/thread/[threadId]/send/route.ts
- apps/api/app/api/web/v4/job-poster/messages/threads/route.ts
- apps/api/app/api/web/v4/job-poster/messages/thread/[threadId]/route.ts
- apps/api/app/api/web/v4/job-poster/messages/thread/[threadId]/send/route.ts
- apps/api/src/services/v4/v4MessageService.ts

## DB Entities in Scope
- apps/api/db/schema/v4MessageThread.ts
- apps/api/db/schema/v4Message.ts
- apps/api/db/schema/job.ts
- apps/api/db/schema/v4JobAssignment.ts
- apps/api/db/schema/supportTicket.ts
- apps/api/db/schema/disputeCase.ts
- apps/api/db/schema/user.ts

## Admin Detail Insertion Points (Score Appraisal / AI Enforcement)
- apps/admin/src/app/(admin)/contractors/[id]/page.tsx
- apps/admin/src/app/(admin)/job-posters/[id]/page.tsx
- apps/api/app/api/admin/v4/contractors/[id]/route.ts
- apps/api/app/api/admin/v4/job-posters/[id]/route.ts
- apps/api/src/services/adminV4/usersReadService.ts

## Legacy Freeze Matrix

### Legacy Messaging API Routes to Freeze
- apps/api/app/api/web/contractor/conversations/route.ts
- apps/api/app/api/web/contractor/conversations/[id]/messages/route.ts
- apps/api/app/api/web/job-poster/conversations/route.ts
- apps/api/app/api/web/job-poster/conversations/[id]/messages/route.ts

### Generic Legacy V4 Message Aliases to Freeze
- apps/api/app/api/web/v4/messages/threads/route.ts
- apps/api/app/api/web/v4/messages/thread/[threadId]/route.ts
- apps/api/app/api/web/v4/messages/thread/[threadId]/send/route.ts

### Legacy Frontend Proxy Routes to Freeze
- apps/web/src/app/api/app/contractor/conversations/[conversationId]/messages/route.ts
- apps/web/src/app/api/app/job-poster/conversations/[conversationId]/messages/route.ts

### Legacy UI Message Pages to Redirect
- apps/web/src/app/app/contractor/(app)/messages/page.tsx -> /dashboard/contractor/messages
- apps/web/src/app/app/job-poster/(app)/messages/page.tsx -> /dashboard/job-poster/messages

### Deprecated Complete Endpoint to Freeze After Mark-Complete Cutover
- apps/api/app/api/web/v4/contractor/jobs/[jobId]/complete/route.ts -> /api/web/v4/contractor/jobs/[jobId]/mark-complete

## Freeze Response Contract
- HTTP: 410
- Body: {"ok":false,"code":"LEGACY_ROUTE_FROZEN","message":"This legacy route is frozen. Use <new-route>."}
- No DB writes or side effects allowed.

## Support + Disputes schema notes (Postgres → Drizzle)

This document captures the **live Postgres schema** (schema: `8fold_test`) for support/dispute functionality and how it maps to Drizzle definitions in `apps/api/db/schema/`.

### Tables (actual names)

#### `support_tickets`
- **Columns**
  - `id text PK`
  - `createdAt timestamp not null default now()`
  - `updatedAt timestamp not null` (no DB default)
  - `type SupportTicketType not null`
  - `status SupportTicketStatus not null default 'OPEN'`
  - `category SupportTicketCategory not null`
  - `priority SupportTicketPriority not null default 'NORMAL'`
  - `createdById text not null`
  - `assignedToId text null`
  - `roleContext SupportRoleContext not null`
  - `subject text not null`
- **Indexes**
  - `support_tickets_createdById_createdAt_idx` on (`createdById`, `createdAt`)
  - `support_tickets_assignedToId_updatedAt_idx` on (`assignedToId`, `updatedAt`)
  - `support_tickets_status_priority_createdAt_idx` on (`status`, `priority`, `createdAt`)

#### `support_messages`
- **Columns**
  - `id text PK`
  - `createdAt timestamp not null default now()`
  - `ticketId text not null`
  - `authorId text not null`
  - `message text not null`
- **Indexes**
  - `support_messages_ticketId_createdAt_idx` on (`ticketId`, `createdAt`)
  - `support_messages_authorId_createdAt_idx` on (`authorId`, `createdAt`)

#### `support_attachments`
- **Columns**
  - `id text PK`
  - `createdAt timestamp not null default now()`
  - `ticketId text not null`
  - `uploadedById text not null`
  - `originalName text not null`
  - `mimeType text not null`
  - `sizeBytes int not null`
  - `storageKey text not null` (**unique**)
  - `sha256 text null`
- **Indexes**
  - `support_attachments_ticketId_createdAt_idx` on (`ticketId`, `createdAt`)
  - `support_attachments_uploadedById_createdAt_idx` on (`uploadedById`, `createdAt`)
  - `support_attachments_storageKey_key` unique (`storageKey`)

#### `dispute_cases`
- **Columns**
  - `id text PK`
  - `createdAt timestamp not null default now()`
  - `updatedAt timestamp not null` (no DB default)
  - `ticketId text not null` (**unique**)
  - `jobId text not null`
  - `filedByUserId text not null`
  - `againstUserId text not null`
  - `againstRole DisputeAgainstRole not null`
  - `disputeReason DisputeReason not null`
  - `description text not null`
  - `status DisputeStatus not null default 'SUBMITTED'`
  - `decision DisputeDecision null`
  - `decisionSummary text null`
  - `decisionAt timestamp null`
  - `deadlineAt timestamp not null`
- **Indexes**
  - `dispute_cases_jobId_idx` on (`jobId`)
  - `dispute_cases_status_deadlineAt_idx` on (`status`, `deadlineAt`)
  - `dispute_cases_filedByUserId_createdAt_idx` on (`filedByUserId`, `createdAt`)
  - `dispute_cases_ticketId_key` unique (`ticketId`)

#### Audit log table (important naming)
- The audit log table is **`"AuditLog"`** (PascalCase), not `audit_logs`.
- Columns: `id`, `createdAt`, `actorUserId`, `actorAdminUserId (uuid)`, `action`, `entityType`, `entityId`, `metadata (jsonb)`
- Index: `"AuditLog_entityType_entityId_createdAt_idx"`

### Enums (DB enum types)
Support:
- `SupportTicketStatus`: `OPEN | IN_PROGRESS | RESOLVED | CLOSED`
- `SupportTicketType`: `HELP | DISPUTE`
- `SupportTicketPriority`: `LOW | NORMAL | HIGH`
- `SupportTicketCategory`: `PRICING | JOB_POSTING | ROUTING | CONTRACTOR | PAYOUTS | OTHER`
- `SupportRoleContext`: `JOB_POSTER | ROUTER | CONTRACTOR`

Disputes:
- `DisputeStatus`: `SUBMITTED | UNDER_REVIEW | NEEDS_INFO | DECIDED | CLOSED`
- `DisputeReason`: `PRICING | WORK_QUALITY | NO_SHOW | PAYMENT | OTHER`
- `DisputeAgainstRole`: `JOB_POSTER | CONTRACTOR`
- `DisputeDecision`: `FAVOR_POSTER | FAVOR_CONTRACTOR | PARTIAL | NO_ACTION | FAVOR_JOB_POSTER`
- `DisputeEnforcementActionType`: `RELEASE_ESCROW_FULL | WITHHOLD_FUNDS | RELEASE_ESCROW_PARTIAL | FLAG_ACCOUNT_INTERNAL`

### Drizzle schema files (source of truth for migration work)
- `apps/api/db/schema/supportTicket.ts`
- `apps/api/db/schema/supportMessage.ts`
- `apps/api/db/schema/supportAttachment.ts` (**updated to match `originalName/mimeType/sizeBytes/sha256 nullable`**)
- `apps/api/db/schema/disputeCase.ts` (**updated to include all DB columns + enums; removed incorrect defaults**)
- `apps/api/db/schema/enums.ts` (**added dispute enums**)

### Index/migration status
All “typical needed” indexes you listed are already present in the live DB for these tables, so **no new migration was added in this step**.


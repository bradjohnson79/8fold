## Support endpoint map (admin + web)

This document maps support endpoints to the DB tables they touch and whether the handler is **read-only** or **transactional**.

### Admin support (`apps/api/app/api/admin/support/**`)

#### Tickets
- **GET** `/api/admin/support/tickets`
  - **tables**: `support_tickets`, `support_messages` (message counts)
  - **mode**: read
- **GET** `/api/admin/support/tickets/:id`
  - **tables**: `support_tickets`, `support_messages`, `support_attachments`, `dispute_cases`
  - **mode**: read
- **POST** `/api/admin/support/tickets/:id/messages`
  - **tables**: `support_messages`, `support_tickets` (touch `updatedAt`), `"AuditLog"`
  - **mode**: tx
- **POST** `/api/admin/support/tickets/:id/assign-to-me`
  - **tables**: `support_tickets`, `"AuditLog"`
  - **mode**: tx
- **POST** `/api/admin/support/tickets/:id/assign`
  - **tables**: `support_tickets`, `"AuditLog"`, `User`, `routers` (assignee validation)
  - **mode**: tx

#### Disputes
- **GET** `/api/admin/support/disputes`
  - **tables**: `dispute_cases`, `support_tickets`
  - **mode**: read
- **GET** `/api/admin/support/disputes/:id`
  - **tables**: `dispute_cases`, `support_tickets`, `support_messages`
  - **mode**: read
- **POST** `/api/admin/support/disputes/:id/status`
  - **tables**: `dispute_cases`, `"AuditLog"`
  - **mode**: tx
- **POST** `/api/admin/support/disputes/:id/decision`
  - **tables**: `dispute_cases`, `dispute_enforcement_actions` (optional), `"AuditLog"`
  - **mode**: tx
- **POST** `/api/admin/support/disputes/:id/enforcement/execute`
  - **tables**: `dispute_enforcement_actions`, `dispute_cases`, `JobHold`, `JobPayment`, `Job`, `internal_account_flags`, `"AuditLog"`
  - **mode**: tx (service)
- **POST** `/api/admin/support/disputes/sla-monitor`
  - **tables**: `dispute_cases`, `dispute_alerts`, `support_tickets`, `Job`, `"AuditLog"`
  - **mode**: tx per overdue dispute (service)


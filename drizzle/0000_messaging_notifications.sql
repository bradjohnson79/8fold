-- Messaging + Notifications (Drizzle-first, new persistent storage)
-- NOTE: This migration targets the schema used by the app via DATABASE_URL ?schema=...
-- In local dev for this repo, that schema is `8fold_test`.

create schema if not exists "8fold_test";

-- Conversations: job-bound contractor ↔ job poster chat threads
create table if not exists "8fold_test"."conversations" (
  "id" text primary key,
  "jobId" text not null,
  "contractorUserId" text not null,
  "jobPosterUserId" text not null,
  "createdAt" timestamp not null default now(),
  "updatedAt" timestamp not null default now()
);

create unique index if not exists "conversations_job_participants_uniq"
  on "8fold_test"."conversations" ("jobId", "contractorUserId", "jobPosterUserId");

create index if not exists "conversations_jobId_idx"
  on "8fold_test"."conversations" ("jobId");

create index if not exists "conversations_participants_idx"
  on "8fold_test"."conversations" ("contractorUserId", "jobPosterUserId");

-- Messages: plain-text messages inside a conversation
create table if not exists "8fold_test"."messages" (
  "id" text primary key,
  "conversationId" text not null,
  "senderUserId" text not null,
  "senderRole" text not null,
  "body" text not null,
  "createdAt" timestamp not null default now()
);

create index if not exists "messages_conversation_created_idx"
  on "8fold_test"."messages" ("conversationId", "createdAt");

-- Notification deliveries: one row per recipient (read/unread is per user)
create table if not exists "8fold_test"."notification_deliveries" (
  "id" text primary key,
  "userId" text not null,
  "title" text not null,
  "body" text,
  "createdAt" timestamp not null default now(),
  "readAt" timestamp null,
  "createdByAdminUserId" text,
  "jobId" text
);

create index if not exists "notification_deliveries_user_created_idx"
  on "8fold_test"."notification_deliveries" ("userId", "createdAt");

create index if not exists "notification_deliveries_user_read_idx"
  on "8fold_test"."notification_deliveries" ("userId", "readAt");


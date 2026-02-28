import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Client } from "pg";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(SCRIPT_DIR, "..", ".env.local") });

function mustEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function schemaFromDatabaseUrl(url: string): string {
  try {
    const u = new URL(url);
    const s = u.searchParams.get("schema");
    return s && /^[a-zA-Z0-9_]+$/.test(s) ? s : "public";
  } catch {
    return "public";
  }
}

export type AdminV4SyncResult = {
  since: Date;
  completedAt: Date;
  counts: Record<string, number>;
};

export async function runAdminV4DomainSync(opts: { full: boolean }): Promise<AdminV4SyncResult> {
  const DATABASE_URL = mustEnv("DATABASE_URL");
  const schema = schemaFromDatabaseUrl(DATABASE_URL);

  const q = (name: string) => `"${schema}"."${name}"`;
  const checkpointKey = "admin_v4_domain";

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    await client.query("BEGIN");

    const checkpointRes = await client.query(
      `select "last_synced_at" from ${q("v4_admin_sync_checkpoints")} where "key" = $1 limit 1`,
      [checkpointKey],
    );

    const checkpointTs = checkpointRes.rows[0]?.last_synced_at ? new Date(checkpointRes.rows[0].last_synced_at) : null;
    const since = opts.full ? new Date(0) : checkpointTs ?? new Date(0);

    const counts: Record<string, number> = {};

    // User directory (non-admin identities)
    const userUpsert = await client.query(
      `insert into ${q("v4_admin_users")}
         ("id","email","role","status","name","phone","country","state","city","first_name","last_name","suspended_until","suspension_reason","archived_at","archived_reason","created_at")
       select
         u."id",
         lower(coalesce(nullif(u."email", ''), u."id" || '@no-email.local')),
         coalesce(u."role"::text, 'JOB_POSTER'),
         coalesce(u."status"::text, 'ACTIVE'),
         u."name",
         u."phoneNumber",
         u."country"::text,
         nullif(u."stateCode", ''),
         nullif(u."legalCity", ''),
         null,
         null,
         u."suspendedUntil",
         u."suspensionReason",
         u."archivedAt",
         u."archivedReason",
         coalesce(u."createdAt", now())
       from ${q("User")} u
       where coalesce(u."role"::text, '') <> 'ADMIN'
         and coalesce(u."updatedAt", u."createdAt", now()) >= $1
       on conflict ("id") do update set
         "email" = excluded."email",
         "role" = excluded."role",
         "status" = excluded."status",
         "name" = excluded."name",
         "phone" = excluded."phone",
         "country" = excluded."country",
         "state" = excluded."state",
         "city" = excluded."city",
         "suspended_until" = excluded."suspended_until",
         "suspension_reason" = excluded."suspension_reason",
         "archived_at" = excluded."archived_at",
         "archived_reason" = excluded."archived_reason"`,
      [since],
    );
    counts.users = userUpsert.rowCount ?? 0;

    // Admin identities + auth data
    const adminUpsert = await client.query(
      `insert into ${q("v4_admin_users")}
         ("id","auth_subject_id","email","role","password_hash","status","name","country","state","city","created_at","last_login_at")
       select
         a."id"::text,
         a."id",
         lower(a."email"),
         coalesce(a."role", 'ADMIN'),
         a."passwordHash",
         'ACTIVE',
         a."fullName",
         a."country",
         a."state",
         a."city",
         coalesce(a."createdAt", now()),
         now()
       from ${q("AdminUser")} a
       on conflict ("id") do update set
         "auth_subject_id" = excluded."auth_subject_id",
         "email" = excluded."email",
         "role" = excluded."role",
         "password_hash" = excluded."password_hash",
         "status" = 'ACTIVE',
         "name" = excluded."name",
         "country" = excluded."country",
         "state" = excluded."state",
         "city" = excluded."city",
         "last_login_at" = excluded."last_login_at"`,
    );
    counts.adminUsers = adminUpsert.rowCount ?? 0;

    // Jobs + latest assignment projection
    const jobsUpsert = await client.query(
      `insert into ${q("v4_admin_jobs")}
         ("id","status","title","country","province","city","address","trade","job_source","routing_status","archived","assignment_id","assignment_status","assignment_contractor_id","assignment_contractor_name","assignment_contractor_email","amount_cents","payment_status","payout_status","created_at","published_at","updated_at")
       select
         j."id",
         coalesce(j."status"::text, 'UNKNOWN'),
         coalesce(j."title", ''),
         coalesce(j."country"::text, 'US'),
         coalesce(nullif(j."state_code", ''), j."region_code"),
         j."city",
         j."address_full",
         coalesce(j."trade_category"::text, 'HANDYMAN'),
         coalesce(j."job_source"::text, 'REAL'),
         coalesce(j."routing_status"::text, 'UNROUTED'),
         coalesce(j."archived", false),
         a."id",
         a."status",
         a."contractorId",
         a."businessName",
         a."email",
         coalesce(j."amount_cents", 0),
         coalesce(j."payment_status"::text, 'UNPAID'),
         coalesce(j."payout_status"::text, 'NOT_READY'),
         coalesce(j."created_at", now()),
         j."published_at",
         coalesce(j."updated_at", now())
       from ${q("jobs")} j
       left join lateral (
         select
           ja."id",
           ja."status",
           ja."contractorId",
           c."businessName",
           c."email"
         from ${q("JobAssignment")} ja
         left join ${q("Contractor")} c on c."id" = ja."contractorId"
         where ja."jobId" = j."id"
         order by ja."createdAt" desc
         limit 1
       ) a on true
       where coalesce(j."updated_at", j."created_at", now()) >= $1
       on conflict ("id") do update set
         "status" = excluded."status",
         "title" = excluded."title",
         "country" = excluded."country",
         "province" = excluded."province",
         "city" = excluded."city",
         "address" = excluded."address",
         "trade" = excluded."trade",
         "job_source" = excluded."job_source",
         "routing_status" = excluded."routing_status",
         "archived" = excluded."archived",
         "assignment_id" = excluded."assignment_id",
         "assignment_status" = excluded."assignment_status",
         "assignment_contractor_id" = excluded."assignment_contractor_id",
         "assignment_contractor_name" = excluded."assignment_contractor_name",
         "assignment_contractor_email" = excluded."assignment_contractor_email",
         "amount_cents" = excluded."amount_cents",
         "payment_status" = excluded."payment_status",
         "payout_status" = excluded."payout_status",
         "created_at" = excluded."created_at",
         "published_at" = excluded."published_at",
         "updated_at" = excluded."updated_at"`,
      [since],
    );
    counts.jobs = jobsUpsert.rowCount ?? 0;

    const payoutRequestsUpsert = await client.query(
      `insert into ${q("v4_admin_payout_requests")}
         ("id","user_id","user_email","user_role","amount_cents","status","payout_id","created_at")
       select
         pr."id",
         pr."userId",
         u."email",
         coalesce(u."role"::text, 'UNKNOWN'),
         coalesce(pr."amountCents", 0),
         coalesce(pr."status"::text, 'REQUESTED'),
         pr."payoutId",
         coalesce(pr."createdAt", now())
       from ${q("PayoutRequest")} pr
       left join ${q("User")} u on u."id" = pr."userId"
       on conflict ("id") do update set
         "user_id" = excluded."user_id",
         "user_email" = excluded."user_email",
         "user_role" = excluded."user_role",
         "amount_cents" = excluded."amount_cents",
         "status" = excluded."status",
         "payout_id" = excluded."payout_id",
         "created_at" = excluded."created_at"`,
    );
    counts.payoutRequests = payoutRequestsUpsert.rowCount ?? 0;

    const transfersUpsert = await client.query(
      `insert into ${q("v4_admin_transfers")}
         ("id","job_id","role","user_id","user_email","user_name","amount_cents","currency","method","stripe_transfer_id","external_ref","status","failure_reason","job_title","created_at","released_at")
       select
         tr."id"::text,
         tr."jobId",
         coalesce(tr."role", 'UNKNOWN'),
         tr."userId",
         u."email",
         u."name",
         coalesce(tr."amountCents", 0),
         coalesce(tr."currency", 'USD'),
         coalesce(tr."method", 'STRIPE'),
         tr."stripeTransferId",
         tr."externalRef",
         coalesce(tr."status", 'PENDING'),
         tr."failureReason",
         j."title",
         coalesce(tr."createdAt", now()),
         tr."releasedAt"
       from ${q("TransferRecord")} tr
       left join ${q("User")} u on u."id" = tr."userId"
       left join ${q("jobs")} j on j."id" = tr."jobId"
       where coalesce(tr."createdAt", now()) >= $1
       on conflict ("id") do update set
         "job_id" = excluded."job_id",
         "role" = excluded."role",
         "user_id" = excluded."user_id",
         "user_email" = excluded."user_email",
         "user_name" = excluded."user_name",
         "amount_cents" = excluded."amount_cents",
         "currency" = excluded."currency",
         "method" = excluded."method",
         "stripe_transfer_id" = excluded."stripe_transfer_id",
         "external_ref" = excluded."external_ref",
         "status" = excluded."status",
         "failure_reason" = excluded."failure_reason",
         "job_title" = excluded."job_title",
         "created_at" = excluded."created_at",
         "released_at" = excluded."released_at"`,
      [since],
    );
    counts.transfers = transfersUpsert.rowCount ?? 0;

    const disputesUpsert = await client.query(
      `insert into ${q("v4_admin_disputes")}
         ("id","ticket_id","job_id","filed_by_user_id","against_user_id","against_role","dispute_reason","description","status","decision","decision_summary","decision_at","deadline_at","ticket_subject","ticket_priority","ticket_category","ticket_status","created_at","updated_at")
       select
         d."id",
         d."ticketId",
         d."jobId",
         d."filedByUserId",
         d."againstUserId",
         d."againstRole"::text,
         d."disputeReason"::text,
         d."description",
         d."status"::text,
         d."decision"::text,
         d."decisionSummary",
         d."decisionAt",
         d."deadlineAt",
         t."subject",
         t."priority"::text,
         t."category"::text,
         t."status"::text,
         coalesce(d."createdAt", now()),
         coalesce(d."updatedAt", now())
       from ${q("dispute_cases")} d
       left join ${q("support_tickets")} t on t."id" = d."ticketId"
       where coalesce(d."updatedAt", d."createdAt", now()) >= $1
       on conflict ("id") do update set
         "ticket_id" = excluded."ticket_id",
         "job_id" = excluded."job_id",
         "filed_by_user_id" = excluded."filed_by_user_id",
         "against_user_id" = excluded."against_user_id",
         "against_role" = excluded."against_role",
         "dispute_reason" = excluded."dispute_reason",
         "description" = excluded."description",
         "status" = excluded."status",
         "decision" = excluded."decision",
         "decision_summary" = excluded."decision_summary",
         "decision_at" = excluded."decision_at",
         "deadline_at" = excluded."deadline_at",
         "ticket_subject" = excluded."ticket_subject",
         "ticket_priority" = excluded."ticket_priority",
         "ticket_category" = excluded."ticket_category",
         "ticket_status" = excluded."ticket_status",
         "created_at" = excluded."created_at",
         "updated_at" = excluded."updated_at"`,
      [since],
    );
    counts.disputes = disputesUpsert.rowCount ?? 0;

    const supportUpsert = await client.query(
      `insert into ${q("v4_admin_support_tickets")}
         ("id","type","status","category","priority","role_context","subject","created_by_id","assigned_to_id","message_count","last_message_at","created_at","updated_at")
       select
         t."id",
         t."type"::text,
         t."status"::text,
         t."category"::text,
         t."priority"::text,
         t."roleContext"::text,
         t."subject",
         t."createdById",
         t."assignedToId",
         coalesce(m."message_count", 0),
         m."last_message_at",
         coalesce(t."createdAt", now()),
         coalesce(t."updatedAt", now())
       from ${q("support_tickets")} t
       left join (
         select
           sm."ticketId" as ticket_id,
           count(*)::int as message_count,
           max(sm."createdAt") as last_message_at
         from ${q("support_messages")} sm
         group by sm."ticketId"
       ) m on m.ticket_id = t."id"
       where coalesce(t."updatedAt", t."createdAt", now()) >= $1
       on conflict ("id") do update set
         "type" = excluded."type",
         "status" = excluded."status",
         "category" = excluded."category",
         "priority" = excluded."priority",
         "role_context" = excluded."role_context",
         "subject" = excluded."subject",
         "created_by_id" = excluded."created_by_id",
         "assigned_to_id" = excluded."assigned_to_id",
         "message_count" = excluded."message_count",
         "last_message_at" = excluded."last_message_at",
         "created_at" = excluded."created_at",
         "updated_at" = excluded."updated_at"`,
      [since],
    );
    counts.supportTickets = supportUpsert.rowCount ?? 0;

    const monitoringAlerts = await client.query(
      `insert into ${q("v4_admin_integrity_alerts")}
         ("id","type","severity","entity_type","entity_id","message","status","created_at","resolved_at")
       select
         'monitor:' || me."id"::text,
         coalesce(me."type"::text, 'MONITORING_EVENT'),
         case when me."handledAt" is null then 'HIGH' else 'LOW' end,
         'JOB',
         coalesce(me."jobId", 'unknown'),
         'Monitoring event ' || coalesce(me."type"::text, 'UNKNOWN') || ' on job ' || coalesce(me."jobId", 'unknown'),
         case when me."handledAt" is null then 'OPEN' else 'RESOLVED' end,
         coalesce(me."createdAt", now()),
         me."handledAt"
       from ${q("monitoring_events")} me
       where coalesce(me."createdAt", now()) >= $1
       on conflict ("id") do update set
         "type" = excluded."type",
         "severity" = excluded."severity",
         "entity_type" = excluded."entity_type",
         "entity_id" = excluded."entity_id",
         "message" = excluded."message",
         "status" = excluded."status",
         "created_at" = excluded."created_at",
         "resolved_at" = excluded."resolved_at"`,
      [since],
    );

    const jobFlagAlerts = await client.query(
      `insert into ${q("v4_admin_integrity_alerts")}
         ("id","type","severity","entity_type","entity_id","message","status","created_at","resolved_at")
       select
         'job_flag:' || jf."id",
         'JOB_FLAG',
         case when coalesce(jf."resolved", false) then 'LOW' else 'HIGH' end,
         'JOB',
         jf."jobId",
         'Job flag: ' || left(jf."reason", 300),
         case when coalesce(jf."resolved", false) then 'RESOLVED' else 'OPEN' end,
         coalesce(jf."createdAt", now()),
         null
       from ${q("JobFlag")} jf
       where coalesce(jf."createdAt", now()) >= $1
       on conflict ("id") do update set
         "severity" = excluded."severity",
         "message" = excluded."message",
         "status" = excluded."status",
         "created_at" = excluded."created_at"`,
      [since],
    );

    const accountFlagAlerts = await client.query(
      `insert into ${q("v4_admin_integrity_alerts")}
         ("id","type","severity","entity_type","entity_id","message","status","created_at","resolved_at")
       select
         'acct_flag:' || iaf."id",
         coalesce(iaf."type"::text, 'ACCOUNT_FLAG'),
         case when coalesce(iaf."status", 'ACTIVE') = 'ACTIVE' then 'HIGH' else 'LOW' end,
         'USER',
         iaf."userId",
         'Account flag: ' || left(coalesce(iaf."reason", ''), 300),
         case when coalesce(iaf."status", 'ACTIVE') = 'ACTIVE' then 'OPEN' else 'RESOLVED' end,
         coalesce(iaf."createdAt", now()),
         iaf."resolvedAt"
       from ${q("internal_account_flags")} iaf
       where coalesce(iaf."createdAt", now()) >= $1
       on conflict ("id") do update set
         "type" = excluded."type",
         "severity" = excluded."severity",
         "entity_type" = excluded."entity_type",
         "entity_id" = excluded."entity_id",
         "message" = excluded."message",
         "status" = excluded."status",
         "created_at" = excluded."created_at",
         "resolved_at" = excluded."resolved_at"`,
      [since],
    );

    counts.integrityAlerts = (monitoringAlerts.rowCount ?? 0) + (jobFlagAlerts.rowCount ?? 0) + (accountFlagAlerts.rowCount ?? 0);

    const completedAt = new Date();
    await client.query(
      `insert into ${q("v4_admin_sync_checkpoints")} ("key", "last_synced_at", "updated_at")
       values ($1, $2, now())
       on conflict ("key") do update
         set "last_synced_at" = excluded."last_synced_at", "updated_at" = now()`,
      [checkpointKey, completedAt],
    );

    await client.query("COMMIT");
    return { since, completedAt, counts };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    await client.end();
  }
}

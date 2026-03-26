import { eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  contractorLeads,
  jobPosterLeads,
} from "@/db/schema/directoryEngine";
import {
  classifyEmailType,
  runBulkDomainDiscoveryAsync,
  type DomainImportRow,
} from "@/src/services/lgs/domainDiscoveryService";
import { enqueueVerificationEmail } from "@/src/services/lgs/emailVerificationService";
import type { DomainFileRow } from "@/src/services/lgs/parseDomainFile";

type CampaignType = "contractor" | "jobs";

type StructuredImportOptions = {
  defaultCampaignType?: CampaignType;
  forceCampaignType?: CampaignType;
  source?: string;
};

export type StructuredImportSummary = {
  total_rows: number;
  inserted: number;
  skipped: number;
  needs_enrichment: number;
  enrichment_run_ids: Array<{ campaign_type: CampaignType; run_id: string; domains_total: number }>;
};

type QueueRow = Omit<DomainImportRow, "campaignType"> & {
  campaignType: CampaignType;
  targetLeadId: string;
};

type ContractorMatch = {
  id: string;
  leadName: string | null;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  businessName: string | null;
  address: string | null;
  email: string | null;
  website: string | null;
  trade: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  source: string | null;
  campaignId: string | null;
  needsEnrichment: boolean;
  assignmentStatus: string;
};

type JobPosterMatch = {
  id: string;
  companyName: string | null;
  contactName: string | null;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  email: string | null;
  website: string;
  category: string;
  trade: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  source: string | null;
  campaignId: string | null;
  needsEnrichment: boolean;
  assignmentStatus: string;
};

function normalizeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function buildContactName(row: DomainFileRow): string | undefined {
  const full = [normalizeText(row.firstName), normalizeText(row.lastName)].filter(Boolean).join(" ").trim();
  return full || undefined;
}

function isBlank(value: string | null | undefined): boolean {
  return !String(value ?? "").trim();
}

function assignIfBlank<T extends Record<string, unknown>>(
  patch: T,
  key: keyof T,
  current: string | null | undefined,
  incoming: string | undefined
) {
  if (incoming && isBlank(current)) {
    patch[key] = incoming as T[keyof T];
  }
}

async function nextContractorLeadNumber(): Promise<number> {
  const seqResult = await db.execute(
    sql`SELECT nextval('directory_engine.contractor_leads_lead_number_seq') AS n`
  );
  return Number(((seqResult.rows ?? seqResult) as Array<{ n: string }>)[0].n);
}

async function findExistingContractorLead(row: DomainFileRow): Promise<ContractorMatch | null> {
  const domain = row.domain.toLowerCase();
  const email = row.email?.toLowerCase();

  const [byWebsite] = await db
    .select({
      id: contractorLeads.id,
      leadName: contractorLeads.leadName,
      firstName: contractorLeads.firstName,
      lastName: contractorLeads.lastName,
      title: contractorLeads.title,
      businessName: contractorLeads.businessName,
      address: contractorLeads.address,
      email: contractorLeads.email,
      website: contractorLeads.website,
      trade: contractorLeads.trade,
      city: contractorLeads.city,
      state: contractorLeads.state,
      country: contractorLeads.country,
      source: contractorLeads.source,
      campaignId: contractorLeads.campaignId,
      needsEnrichment: contractorLeads.needsEnrichment,
      assignmentStatus: contractorLeads.assignmentStatus,
    })
    .from(contractorLeads)
    .where(sql`lower(${contractorLeads.website}) = ${domain}`)
    .limit(1);

  if (byWebsite) return byWebsite;
  if (!email) return null;

  const [byEmail] = await db
    .select({
      id: contractorLeads.id,
      leadName: contractorLeads.leadName,
      firstName: contractorLeads.firstName,
      lastName: contractorLeads.lastName,
      title: contractorLeads.title,
      businessName: contractorLeads.businessName,
      address: contractorLeads.address,
      email: contractorLeads.email,
      website: contractorLeads.website,
      trade: contractorLeads.trade,
      city: contractorLeads.city,
      state: contractorLeads.state,
      country: contractorLeads.country,
      source: contractorLeads.source,
      campaignId: contractorLeads.campaignId,
      needsEnrichment: contractorLeads.needsEnrichment,
      assignmentStatus: contractorLeads.assignmentStatus,
    })
    .from(contractorLeads)
    .where(sql`lower(${contractorLeads.email}) = ${email}`)
    .limit(1);

  return byEmail ?? null;
}

async function findExistingJobPosterLead(row: DomainFileRow): Promise<JobPosterMatch | null> {
  const domain = row.domain.toLowerCase();
  const email = row.email?.toLowerCase();

  const [byWebsite] = await db
    .select({
      id: jobPosterLeads.id,
      companyName: jobPosterLeads.companyName,
      contactName: jobPosterLeads.contactName,
      firstName: jobPosterLeads.firstName,
      lastName: jobPosterLeads.lastName,
      title: jobPosterLeads.title,
      email: jobPosterLeads.email,
      website: jobPosterLeads.website,
      category: jobPosterLeads.category,
      trade: jobPosterLeads.trade,
      address: jobPosterLeads.address,
      city: jobPosterLeads.city,
      state: jobPosterLeads.state,
      country: jobPosterLeads.country,
      source: jobPosterLeads.source,
      campaignId: jobPosterLeads.campaignId,
      needsEnrichment: jobPosterLeads.needsEnrichment,
      assignmentStatus: jobPosterLeads.assignmentStatus,
    })
    .from(jobPosterLeads)
    .where(sql`lower(${jobPosterLeads.website}) = ${domain}`)
    .limit(1);

  if (byWebsite) return byWebsite;
  if (!email) return null;

  const [byEmail] = await db
    .select({
      id: jobPosterLeads.id,
      companyName: jobPosterLeads.companyName,
      contactName: jobPosterLeads.contactName,
      firstName: jobPosterLeads.firstName,
      lastName: jobPosterLeads.lastName,
      title: jobPosterLeads.title,
      email: jobPosterLeads.email,
      website: jobPosterLeads.website,
      category: jobPosterLeads.category,
      trade: jobPosterLeads.trade,
      address: jobPosterLeads.address,
      city: jobPosterLeads.city,
      state: jobPosterLeads.state,
      country: jobPosterLeads.country,
      source: jobPosterLeads.source,
      campaignId: jobPosterLeads.campaignId,
      needsEnrichment: jobPosterLeads.needsEnrichment,
      assignmentStatus: jobPosterLeads.assignmentStatus,
    })
    .from(jobPosterLeads)
    .where(sql`lower(${jobPosterLeads.email}) = ${email}`)
    .limit(1);

  return byEmail ?? null;
}

function getCampaignType(row: DomainFileRow, opts: StructuredImportOptions): CampaignType {
  if (opts.forceCampaignType) return opts.forceCampaignType;
  return row.campaignType ?? opts.defaultCampaignType ?? "contractor";
}

export function shouldUseStructuredImport(rows: DomainFileRow[], opts?: StructuredImportOptions): boolean {
  if (opts?.forceCampaignType === "contractor") return true;
  return rows.some((row) => row.campaignType === "jobs" || row.email || row.company || row.address || row.firstName || row.lastName || row.title || row.trade);
}

export async function importStructuredLeadRows(
  rows: DomainFileRow[],
  opts: StructuredImportOptions = {}
): Promise<StructuredImportSummary> {
  let inserted = 0;
  let skipped = 0;
  let needsEnrichment = 0;
  const enrichmentQueue: QueueRow[] = [];

  for (const row of rows) {
    const campaignType = getCampaignType(row, opts);
    const contactName = buildContactName(row);
    const needsRowEnrichment = !row.email;
    const source = opts.source ?? "structured_import";

    if (campaignType === "jobs") {
      const existing = await findExistingJobPosterLead(row);

      if (existing) {
        const patch: Partial<typeof jobPosterLeads.$inferInsert> = {
          updatedAt: new Date(),
        };
        assignIfBlank(patch, "companyName", existing.companyName, row.company);
        assignIfBlank(patch, "contactName", existing.contactName, contactName);
        assignIfBlank(patch, "firstName", existing.firstName, row.firstName);
        assignIfBlank(patch, "lastName", existing.lastName, row.lastName);
        assignIfBlank(patch, "title", existing.title, row.title);
        assignIfBlank(patch, "email", existing.email, row.email);
        assignIfBlank(patch, "trade", existing.trade, row.trade);
        assignIfBlank(patch, "address", existing.address, row.address);
        assignIfBlank(patch, "city", existing.city, row.city);
        assignIfBlank(patch, "state", existing.state, row.state);
        assignIfBlank(patch, "country", existing.country, row.country);
        assignIfBlank(patch, "source", existing.source, source);
        if (row.category && isBlank(existing.category)) patch.category = row.category;
        if (existing.needsEnrichment && row.email) patch.needsEnrichment = false;
        if (!existing.campaignId && existing.assignmentStatus !== "assigned") {
          patch.assignmentStatus = row.email ? "ready" : "waiting_enrichment";
        }
        if (row.email) {
          patch.emailVerificationStatus = "pending";
          patch.emailVerificationScore = null;
          patch.emailVerificationCheckedAt = null;
          patch.emailVerificationProvider = null;
          patch.processingStatus = "processed";
        } else if (existing.needsEnrichment || needsRowEnrichment) {
          patch.emailVerificationStatus = "pending";
          patch.processingStatus = "enriching";
        }

        const changedKeys = Object.keys(patch).filter((key) => key !== "updatedAt");
        if (changedKeys.length > 0) {
          patch.scoreDirty = true;
          await db.update(jobPosterLeads).set(patch).where(eq(jobPosterLeads.id, existing.id));
          console.log(`[Import] Row processed → duplicate updated (jobs): ${row.domain}`);
          if (row.email) {
            await enqueueVerificationEmail(row.email);
            console.log(`[AutoVerify] Queued ${row.email}`);
          }
        } else {
          console.log(`[Import] Duplicate skipped (jobs): ${row.domain}`);
        }
        skipped++;

        if ((existing.needsEnrichment || needsRowEnrichment) && !row.email) {
          needsEnrichment++;
          enrichmentQueue.push({
            domain: row.domain,
            campaignType,
            category: row.category ?? existing.category,
            city: row.city ?? existing.city ?? undefined,
            state: row.state ?? existing.state ?? undefined,
            country: row.country ?? existing.country ?? undefined,
            targetLeadId: existing.id,
          });
          console.log(`[Import] Email missing → queued for enrichment: ${row.domain}`);
        }
        continue;
      }

      const [created] = await db
        .insert(jobPosterLeads)
        .values({
          website: row.domain,
          companyName: row.company ?? null,
          contactName: contactName ?? null,
          firstName: row.firstName ?? null,
          lastName: row.lastName ?? null,
          title: row.title ?? null,
          email: row.email ?? null,
          category: row.category ?? "business",
          trade: row.trade ?? null,
          address: row.address ?? null,
          city: row.city ?? null,
          state: row.state ?? null,
          country: row.country ?? "US",
          source,
          needsEnrichment: needsRowEnrichment,
          assignmentStatus: needsRowEnrichment ? "waiting_enrichment" : "ready",
          emailVerificationStatus: "pending",
          emailVerificationScore: null,
          emailVerificationCheckedAt: null,
          emailVerificationProvider: null,
          status: "new",
          processingStatus: needsRowEnrichment ? "enriching" : "processed",
          archived: false,
          archivedAt: null,
          archiveReason: null,
          leadPriority: "medium",
          prioritySource: "auto",
          scoreDirty: true,
          outreachStage: "not_contacted",
          followupCount: 0,
        })
        .returning({ id: jobPosterLeads.id });

      inserted++;
      console.log(`[Import] Insert success (jobs): ${row.domain}`);

      if (needsRowEnrichment && created) {
        needsEnrichment++;
        enrichmentQueue.push({
          domain: row.domain,
          campaignType,
          category: row.category,
          city: row.city,
          state: row.state,
          country: row.country,
          targetLeadId: created.id,
        });
        console.log(`[Import] Email missing → queued for enrichment: ${row.domain}`);
      }
      if (row.email) {
        await enqueueVerificationEmail(row.email);
        console.log(`[AutoVerify] Queued ${row.email}`);
      }
      continue;
    }

    const existing = await findExistingContractorLead(row);

    if (existing) {
      const patch: Partial<typeof contractorLeads.$inferInsert> = {
        updatedAt: new Date(),
      };
      assignIfBlank(patch, "leadName", existing.leadName, contactName);
      assignIfBlank(patch, "firstName", existing.firstName, row.firstName);
      assignIfBlank(patch, "lastName", existing.lastName, row.lastName);
      assignIfBlank(patch, "title", existing.title, row.title);
      assignIfBlank(patch, "businessName", existing.businessName, row.company);
      assignIfBlank(patch, "address", existing.address, row.address);
      assignIfBlank(patch, "email", existing.email, row.email);
      assignIfBlank(patch, "trade", existing.trade, row.trade);
      assignIfBlank(patch, "city", existing.city, row.city);
      assignIfBlank(patch, "state", existing.state, row.state);
      assignIfBlank(patch, "country", existing.country, row.country);
      assignIfBlank(patch, "source", existing.source, source);
      if (row.email && !existing.email) {
        patch.emailType = classifyEmailType(row.email, row.domain);
        patch.verificationStatus = "pending";
        patch.verificationScore = 0;
        patch.needsEnrichment = false;
        patch.emailVerificationStatus = "pending";
        patch.emailVerificationScore = null;
        patch.emailVerificationCheckedAt = null;
        patch.emailVerificationProvider = null;
        if (!existing.campaignId && existing.assignmentStatus !== "assigned") {
          patch.assignmentStatus = "ready";
        }
      } else if ((existing.needsEnrichment || needsRowEnrichment) && !existing.campaignId && existing.assignmentStatus !== "assigned") {
        patch.assignmentStatus = "waiting_enrichment";
        patch.emailVerificationStatus = "pending";
      }

      const changedKeys = Object.keys(patch).filter((key) => key !== "updatedAt");
      if (changedKeys.length > 0) {
        patch.scoreDirty = true;
        await db.update(contractorLeads).set(patch).where(eq(contractorLeads.id, existing.id));
        console.log(`[Import] Row processed → duplicate updated (contractor): ${row.domain}`);
        if (row.email) {
          await enqueueVerificationEmail(row.email);
          console.log(`[AutoVerify] Queued ${row.email}`);
        }
      } else {
        console.log(`[Import] Duplicate skipped (contractor): ${row.domain}`);
      }
      skipped++;

      if ((existing.needsEnrichment || needsRowEnrichment) && !row.email) {
        needsEnrichment++;
        enrichmentQueue.push({
          domain: row.domain,
          campaignType,
          category: row.category,
          city: row.city ?? existing.city ?? undefined,
          state: row.state ?? existing.state ?? undefined,
          country: row.country ?? existing.country ?? undefined,
          targetLeadId: existing.id,
        });
        console.log(`[Import] Email missing → queued for enrichment: ${row.domain}`);
      }
      continue;
    }

    const leadNumber = await nextContractorLeadNumber();
    const [created] = await db
      .insert(contractorLeads)
      .values({
        leadNumber,
        leadName: contactName ?? null,
        firstName: row.firstName ?? null,
        lastName: row.lastName ?? null,
        title: row.title ?? null,
        businessName: row.company ?? null,
        scrapedBusinessName: row.company ?? null,
        address: row.address ?? null,
        email: row.email ?? null,
        website: row.domain,
        trade: row.trade ?? null,
        city: row.city ?? null,
        state: row.state ?? null,
        country: row.country ?? "US",
        source,
        leadSource: source,
        needsEnrichment: needsRowEnrichment,
        assignmentStatus: needsRowEnrichment ? "waiting_enrichment" : "ready",
        emailVerificationStatus: "pending",
        emailVerificationScore: null,
        emailVerificationCheckedAt: null,
        emailVerificationProvider: null,
        emailType: row.email ? classifyEmailType(row.email, row.domain) : "unknown",
        discoveryMethod: row.email ? "direct_import" : "import_enrichment_pending",
        verificationScore: row.email ? 0 : null,
        verificationStatus: "pending",
        verificationSource: null,
        archived: false,
        archivedAt: null,
        archiveReason: null,
      })
      .returning({ id: contractorLeads.id });

    inserted++;
    console.log(`[Import] Insert success (contractor): ${row.domain}`);

    if (needsRowEnrichment && created) {
      needsEnrichment++;
      enrichmentQueue.push({
        domain: row.domain,
        campaignType,
        category: row.category,
        city: row.city,
        state: row.state,
        country: row.country,
        targetLeadId: created.id,
      });
      console.log(`[Import] Email missing → queued for enrichment: ${row.domain}`);
    }
    if (row.email) {
      await enqueueVerificationEmail(row.email);
      console.log(`[AutoVerify] Queued ${row.email}`);
    }
  }

  const enrichmentByCampaign = new Map<CampaignType, QueueRow[]>();
  for (const row of enrichmentQueue) {
    const bucket = enrichmentByCampaign.get(row.campaignType) ?? [];
    if (!bucket.some((existing) => existing.domain === row.domain && existing.targetLeadId === row.targetLeadId)) {
      bucket.push(row);
    }
    enrichmentByCampaign.set(row.campaignType, bucket);
  }

  const enrichment_run_ids: StructuredImportSummary["enrichment_run_ids"] = [];
  for (const [campaignType, campaignRows] of enrichmentByCampaign) {
    if (campaignRows.length === 0) continue;
    const runId = await runBulkDomainDiscoveryAsync(campaignRows, {
      autoImportSource: "structured_import_enrichment",
      campaignType,
      targetCategory: campaignRows[0]?.category,
    });
    enrichment_run_ids.push({
      campaign_type: campaignType,
      run_id: runId,
      domains_total: campaignRows.length,
    });
  }

  return {
    total_rows: rows.length,
    inserted,
    skipped,
    needs_enrichment: needsEnrichment,
    enrichment_run_ids,
  };
}

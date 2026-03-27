import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobPosterEmailMessages, outreachMessages } from "@/db/schema/directoryEngine";
import {
  generateContractorMessageForLead,
  generateJobPosterMessageForLead,
} from "@/src/services/lgs/outreachAutomationService";

export type MessagePersona = "contractor" | "job_poster";

export type SingleMessageRequestBody = {
  leadId?: string;
  lead_id?: string;
  email?: string | null;
  category?: string | null;
  city?: string | null;
  persona?: MessagePersona;
  pipeline?: "contractor" | "jobs";
  force_regenerate?: boolean;
};

function normalizePersona(body: SingleMessageRequestBody): MessagePersona {
  if (body.persona === "job_poster" || body.pipeline === "jobs") return "job_poster";
  return "contractor";
}

function normalizeLeadId(body: SingleMessageRequestBody): string {
  return String(body.leadId ?? body.lead_id ?? "").trim();
}

function warningForMissingFields(missingFields: string[] | undefined): string | null {
  return missingFields && missingFields.length > 0
    ? "Using limited data — message may be generic"
    : null;
}

async function readContractorMessageById(messageId: string) {
  const [inserted] = await db
    .select({
      id: outreachMessages.id,
      leadId: outreachMessages.leadId,
      subject: outreachMessages.subject,
      body: outreachMessages.body,
      messageHash: outreachMessages.messageHash,
      messageType: outreachMessages.messageType,
      messageVersionHash: outreachMessages.messageVersionHash,
      status: outreachMessages.status,
      createdAt: outreachMessages.createdAt,
    })
    .from(outreachMessages)
    .where(eq(outreachMessages.id, messageId))
    .limit(1);

  return inserted ?? null;
}

async function readJobPosterMessageById(messageId: string) {
  const [inserted] = await db
    .select({
      id: jobPosterEmailMessages.id,
      leadId: jobPosterEmailMessages.leadId,
      subject: jobPosterEmailMessages.subject,
      body: jobPosterEmailMessages.body,
      messageHash: jobPosterEmailMessages.messageHash,
      messageType: jobPosterEmailMessages.messageType,
      messageVersionHash: jobPosterEmailMessages.messageVersionHash,
      status: jobPosterEmailMessages.status,
      createdAt: jobPosterEmailMessages.createdAt,
    })
    .from(jobPosterEmailMessages)
    .where(eq(jobPosterEmailMessages.id, messageId))
    .limit(1);

  return inserted ?? null;
}

export async function handleSingleMessageGeneration(body: SingleMessageRequestBody): Promise<Response> {
  const leadId = normalizeLeadId(body);
  if (!leadId) {
    return Response.json({
      ok: false,
      reason: "missing_data",
      missing_fields: ["leadId"],
      warning: "Using limited data — message may be generic",
    });
  }

  const persona = normalizePersona(body);
  const overrides = {
    email: body.email ?? null,
    category: body.category ?? null,
    city: body.city ?? null,
  };

  const result = persona === "job_poster"
    ? await generateJobPosterMessageForLead(leadId, body.force_regenerate !== true, overrides)
    : await generateContractorMessageForLead(leadId, new Set<string>(), body.force_regenerate !== true, overrides);

  if (!result.ok) {
    if (result.reason === "missing_data") {
      return Response.json({
        ok: false,
        reason: "missing_data",
        missing_fields: result.missingFields ?? [],
        warning: warningForMissingFields(result.missingFields),
      });
    }

    const status = result.error === "lead_not_found" ? 404 : 400;
    return Response.json({ ok: false, error: result.error ?? "generation_failed" }, { status });
  }

  const warning = warningForMissingFields(result.missingFields);
  if (result.skipped) {
    return Response.json({
      ok: true,
      data: {
        skipped: true,
        message_id: result.id,
        limited_data: result.limitedData ?? false,
        missing_fields: result.missingFields ?? [],
        warning,
      },
    });
  }

  const inserted = persona === "job_poster"
    ? await readJobPosterMessageById(result.id!)
    : await readContractorMessageById(result.id!);
  if (!inserted) {
    return Response.json({ ok: false, error: "message_not_found" }, { status: 404 });
  }

  return Response.json({
    ok: true,
    data: {
      id: inserted.id,
      lead_id: inserted.leadId,
      subject: inserted.subject,
      body: inserted.body,
      message_hash: inserted.messageHash,
      message_type: inserted.messageType,
      message_version_hash: inserted.messageVersionHash,
      status: inserted.status,
      created_at: inserted.createdAt?.toISOString() ?? null,
      limited_data: result.limitedData ?? false,
      missing_fields: result.missingFields ?? [],
      warning,
    },
  });
}

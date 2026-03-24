/**
 * LGS: Generate outreach message for a contractor lead.
 *
 * Single prompt. No branches. No templates. No conditional logic.
 * GPT writes the body. System appends CTA + signature.
 */
import crypto from "node:crypto";
import OpenAI from "openai";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorLeads, outreachMessages } from "@/db/schema/directoryEngine";

const MODEL = process.env.OPENAI_MESSAGE_MODEL?.trim() || "gpt-5-nano";
const TEMPERATURE = 0.7;
const MAX_OUTPUT_TOKENS = 160;
const MESSAGE_TYPE = "intro_standard";
const MESSAGE_VERSION = "v3-clean-single";

const HTML_SIGNATURE = `<p>Best,<br>\n<strong>Brad Johnson</strong><br>\nChief Operations Officer<br>\n8Fold.app<br>\ninfo@8fold.app</p>`;

type LeadRecord = {
  id: string;
  email: string;
  businessName: string | null;
  trade: string | null;
  city: string | null;
  state: string | null;
};

function getOpenAiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  return new OpenAI({ apiKey });
}

function buildPrompt(lead: LeadRecord): string {
  const name = lead.businessName || "your business";
  const city = lead.city || "your area";
  const trade = lead.trade || "your type of work";

  const prompt = `Write a short, natural outreach email to a contractor.

Business: ${name}
Trade: ${trade}
Location: ${city}

Context:
8Fold connects contractors with real jobs without bidding wars or lead fees.

Write like a real person:
- no corporate tone
- no fluff
- no "hope you're doing well"
- no "visit our website"
- under 90 words
- end with a simple question

Only return the email body.`;

  console.log("PROMPT:", prompt);
  return prompt;
}

function buildSubject(lead: LeadRecord): string {
  return lead.businessName
    ? `Quick question — ${lead.businessName.trim()}`
    : "Quick question about 8Fold";
}

function textToHtml(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

async function generateBodyForLead(lead: LeadRecord): Promise<string> {
  const openai = getOpenAiClient();
  const prompt = buildPrompt(lead);

  const response = await openai.responses.create({
    model: MODEL,
    input: prompt,
    temperature: TEMPERATURE,
    max_output_tokens: MAX_OUTPUT_TOKENS,
  });

  const raw = response as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  const text =
    raw.output_text ||
    raw.output?.[0]?.content?.[0]?.text;

  console.log("OUTPUT:", text);

  if (!text?.trim()) throw new Error("Empty GPT response");

  return `${textToHtml(text)}\n${HTML_SIGNATURE}`;
}

async function loadLead(leadId: string): Promise<LeadRecord | null> {
  const [lead] = await db
    .select({
      id: contractorLeads.id,
      email: contractorLeads.email,
      businessName: contractorLeads.businessName,
      trade: contractorLeads.trade,
      city: contractorLeads.city,
      state: contractorLeads.state,
    })
    .from(contractorLeads)
    .where(eq(contractorLeads.id, leadId))
    .limit(1);

  if (!lead?.email?.trim()) return null;
  return { ...lead, email: lead.email.trim() };
}

async function generateForLead(
  leadId: string,
  skipIfCurrentVersion = true
): Promise<{ ok: boolean; id?: string; error?: string; skipped?: boolean }> {
  const lead = await loadLead(leadId);
  if (!lead) return { ok: false, error: "lead_not_found" };
  if (!lead.email) return { ok: false, error: "Missing email" };

  if (skipIfCurrentVersion) {
    const [existing] = await db
      .select({ id: outreachMessages.id, messageVersionHash: outreachMessages.messageVersionHash, status: outreachMessages.status })
      .from(outreachMessages)
      .where(eq(outreachMessages.leadId, leadId))
      .limit(1);

    if (existing) {
      // Up-to-date version → skip
      if (existing.messageVersionHash === MESSAGE_VERSION) {
        return { ok: true, skipped: true, id: existing.id };
      }
      // Stale pending_review → delete and regenerate
      if (existing.status === "pending_review") {
        await db.delete(outreachMessages).where(eq(outreachMessages.id, existing.id));
      } else {
        // Approved/sent — never overwrite human decisions
        return { ok: true, skipped: true, id: existing.id };
      }
    }
  }

  const body = await generateBodyForLead(lead);
  const subject = buildSubject(lead);
  const messageHash = crypto.createHash("sha256").update(body).digest("hex");

  const [inserted] = await db
    .insert(outreachMessages)
    .values({
      leadId,
      subject,
      body,
      messageHash,
      generationContext: {
        business_name: lead.businessName ?? "",
        trade: lead.trade ?? "",
        city: lead.city ?? "",
        state: lead.state ?? "",
      },
      generatedBy: MODEL,
      status: "pending_review",
      messageType: MESSAGE_TYPE,
      messageVersionHash: MESSAGE_VERSION,
    })
    .returning();

  await db
    .update(contractorLeads)
    .set({ outreachStage: "message_ready", lastMessageTypeSent: MESSAGE_TYPE, updatedAt: new Date() })
    .where(eq(contractorLeads.id, leadId));

  return { ok: true, id: inserted.id };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      lead_id?: string;
      lead_ids?: string[];
      force_regenerate?: boolean;
    };

    // Bulk generation
    if (Array.isArray(body.lead_ids) && body.lead_ids.length > 0) {
      const skip = body.force_regenerate !== true;
      let generated = 0, skipped = 0, failed = 0;
      const results: Array<{ lead_id: string; ok: boolean; message_id?: string; skipped?: boolean; error?: string }> = [];

      for (const leadId of body.lead_ids.filter(Boolean)) {
        try {
          const result = await generateForLead(leadId, skip);
          results.push({ lead_id: leadId, ok: result.ok, message_id: result.id, skipped: result.skipped, error: result.error });
          if (result.skipped) skipped++;
          else if (result.ok) generated++;
          else failed++;
        } catch (err) {
          results.push({ lead_id: leadId, ok: false, error: err instanceof Error ? err.message : "failed" });
          failed++;
        }
      }
      return Response.json({ ok: true, data: { generated, skipped, failed, results } });
    }

    // Single generation
    const leadId = body.lead_id;
    if (!leadId) return Response.json({ ok: false, error: "lead_id_required" }, { status: 400 });

    const lead = await loadLead(leadId);
    if (!lead) return Response.json({ ok: false, error: "lead_not_found" }, { status: 404 });

    const result = await generateForLead(leadId, body.force_regenerate !== true);
    if (!result.ok) {
      return Response.json({ ok: false, error: result.error ?? "generation_failed" }, { status: result.error === "lead_not_found" ? 404 : 400 });
    }

    if (result.skipped) {
      return Response.json({ ok: true, data: { skipped: true, message_id: result.id } });
    }

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
      .where(eq(outreachMessages.id, result.id!))
      .limit(1);

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
      },
    });
  } catch (err) {
    console.error("GENERATION ERROR:", err);
    return Response.json({ ok: false, error: "Message generation failed" }, { status: 500 });
  }
}

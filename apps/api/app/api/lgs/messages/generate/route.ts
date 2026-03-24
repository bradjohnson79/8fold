/**
 * LGS: Generate outreach message for a contractor lead.
 *
 * Single prompt. No branches. No templates. No conditional logic.
 * GPT writes the body. System appends CTA + signature.
 */
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorLeads, outreachMessages } from "@/db/schema/directoryEngine";
import { getOpenAiClient } from "@/src/lib/openai";

const MODEL = process.env.OPENAI_MESSAGE_MODEL?.trim();
const OUTREACH_MODEL = MODEL && MODEL !== "gpt-5-nano" ? MODEL : "gpt-4.1-mini";
const TEMPERATURE = 0.5;
const MAX_OUTPUT_TOKENS = 220;
const MESSAGE_TYPE = "intro_standard";
const MESSAGE_VERSION = "v5-invitation";

const HTML_SIGNATURE = `<p>Brad Johnson<br>\nChief Operations Officer<br>\n8Fold.app<br>\ninfo@8fold.app</p>`;

// ─────────────────────────────────────────────────────────────────────────────

type LeadRecord = {
  id: string;
  email: string;
  businessName: string | null;
  trade: string | null;
  city: string | null;
  state: string | null;
};

function buildPrompt(lead: LeadRecord): string {
  const businessName = lead.businessName ?? "their business";
  const city = lead.city ?? "their area";
  const trade = lead.trade ?? "their work";

  const prompt = `
Write a short outreach email to a contractor business.

Context:
- Business name: ${businessName || "their business"}
- Trade: ${trade || "their work"}
- Location: ${city || "their area"}

About us:
8Fold connects contractors with real, vetted jobs.
There are no bidding wars and no lead fees.
Contractors receive qualified projects and a predictable workflow.

Goal:
This is an invitation email, not a sales pitch.

Structure (follow exactly):
1. Start with a natural acknowledgment of their business or trade (mention their website or type of work)
2. Introduce 8Fold briefly
3. Explain how it helps contractors like them (simple, practical benefit)
4. Direct them to https://8fold.app to create a free account
5. Thank them for their time

Instructions:
- Sound human and observant (like you actually looked them up)
- Keep tone professional, calm, and grounded
- Do NOT ask for a call, meeting, or chat
- Do NOT use generic phrases like "I hope you're doing well"
- Do NOT sound like marketing copy
- Keep under 140 words

Output:
Return only the email body.`;

  console.log("PROMPT:", prompt);
  return prompt;
}

function buildSubject(lead: LeadRecord): string {
  return lead.businessName
    ? `Join 8Fold — ${lead.businessName.trim()}`
    : "An invitation from 8Fold";
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
    model: OUTREACH_MODEL,
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

  // Guard: reject messages that contain sales/scheduling language
  const cleaned = text.toLowerCase();
  if (
    cleaned.includes("call") ||
    cleaned.includes("chat") ||
    cleaned.includes("schedule") ||
    cleaned.includes("meeting")
  ) {
    throw new Error("Invalid message content (call/chat/schedule/meeting detected)");
  }

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
      generatedBy: OUTREACH_MODEL,
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

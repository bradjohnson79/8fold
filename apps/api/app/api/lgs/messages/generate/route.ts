import crypto from "node:crypto";
import OpenAI from "openai";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorLeads, outreachMessages } from "@/db/schema/directoryEngine";

const MODEL = process.env.OPENAI_MESSAGE_MODEL?.trim() || "gpt-5-nano";
const TEMPERATURE = Number.isFinite(Number(process.env.OPENAI_MESSAGE_TEMPERATURE))
  ? Number(process.env.OPENAI_MESSAGE_TEMPERATURE)
  : 0.7;
const MAX_OUTPUT_TOKENS = Number.isFinite(Number(process.env.OPENAI_MESSAGE_MAX_TOKENS))
  ? Number(process.env.OPENAI_MESSAGE_MAX_TOKENS)
  : 180;
const MESSAGE_TYPE = "intro_standard";
const MESSAGE_VERSION = "v2-human-direct";
const HOOKS = [
  "came across your work while looking at contractors in the area",
  "reaching out to a few local crews",
  "connecting with contractors nearby",
  "talking with contractors in {{city}}",
  "saw your business while looking around {{city}}",
];

type LeadRecord = {
  id: string;
  email: string;
  businessName: string | null;
  trade: string | null;
  city: string | null;
  state: string | null;
  source: string | null;
};

function getOpenAiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY missing in API runtime");
  }
  return new OpenAI({ apiKey });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toHtmlEmailBody(text: string): string {
  const paragraphs = text
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`);

  if (paragraphs.length === 0) {
    throw new Error("Empty GPT response");
  }

  return paragraphs.join("\n");
}

function buildPrompt(lead: LeadRecord): string {
  const businessName = lead.businessName || "their business";
  const city = lead.city || "their area";
  const trade = lead.trade || "their type of work";
  const rawHook = HOOKS[Math.floor(Math.random() * HOOKS.length)] ?? HOOKS[0];
  const hook = rawHook.replace("{{city}}", city);

  const prompt = `You are reaching out to a local contractor business.

Your goal is to start a real conversation — not to pitch, not to sell, not to sound corporate.

Context:
- Business: ${businessName}
- Trade: ${trade}
- Location: ${city}

About us:
8Fold connects contractors with real jobs — no bidding wars, no lead fees, and they keep most of the job value.

Use this opening angle: "${hook}"

Write a short email that:
- feels like a real human wrote it
- references their trade or local presence
- gives a clear reason for reaching out
- avoids corporate or generic language
- avoids "visit our website" phrasing
- avoids sounding like marketing copy
- ends with a simple question

Style:
- casual but respectful
- direct, not fluffy
- under 90 words

DO NOT:
- say "I hope you're doing well"
- say "learn more on our website"
- sound like a template
- use "Hi there," as the opener — use a real opener like "Hey —" or just dive in

Output:
Only the email body. No subject line. No signature. No explanations.`;

  console.log("PROMPT USED:", prompt);
  return prompt;
}

function buildSubject(lead: LeadRecord): string {
  const businessName = lead.businessName?.trim();
  if (businessName) {
    return `Quick question for ${businessName}`;
  }
  return "Quick question about 8Fold";
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
      source: contractorLeads.source,
    })
    .from(contractorLeads)
    .where(eq(contractorLeads.id, leadId))
    .limit(1);

  if (!lead?.email?.trim()) {
    return null;
  }

  return {
    ...lead,
    email: lead.email.trim(),
  };
}

async function generateBodyForLead(lead: LeadRecord): Promise<string> {
  const openai = getOpenAiClient();
  const response = await openai.responses.create({
    model: MODEL,
    input: buildPrompt(lead),
    temperature: TEMPERATURE,
    max_output_tokens: MAX_OUTPUT_TOKENS,
  });

  const rawResponse = response as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };
  const text =
    rawResponse.output_text ||
    rawResponse.output?.[0]?.content?.[0]?.text;

  if (!text?.trim()) {
    throw new Error("Empty GPT response");
  }

  return toHtmlEmailBody(text);
}

async function generateForLead(
  leadId: string,
  existingHashes: Set<string>,
  skipIfExists = true
): Promise<{ ok: boolean; id?: string; error?: string; skipped?: boolean }> {
  const lead = await loadLead(leadId);

  if (!lead) return { ok: false, error: "lead_not_found" };
  if (!lead.email?.trim()) return { ok: false, error: "Missing email" };

  if (skipIfExists) {
    const [existing] = await db
      .select({
        id: outreachMessages.id,
        messageVersionHash: outreachMessages.messageVersionHash,
        status: outreachMessages.status,
      })
      .from(outreachMessages)
      .where(eq(outreachMessages.leadId, leadId))
      .limit(1);

    if (existing) {
      // Return as-is if the version matches current prompt — message is up to date
      if (existing.messageVersionHash === MESSAGE_VERSION) {
        return { ok: true, skipped: true, id: existing.id };
      }
      // Stale version + still pending review → delete and regenerate with current prompt
      if (existing.status === "pending_review") {
        await db.delete(outreachMessages).where(eq(outreachMessages.id, existing.id));
      } else {
        // Approved or sent messages are human-verified — never silently overwrite them
        return { ok: true, skipped: true, id: existing.id };
      }
    }
  }

  const body = await generateBodyForLead(lead);
  const subject = buildSubject(lead);
  const messageHash = crypto.createHash("sha256").update(body).digest("hex");
  existingHashes.add(messageHash);

  const generationContext = {
    business_name: lead.businessName ?? "your business",
    trade: lead.trade ?? "your service",
    city: lead.city ?? "your area",
    state: lead.state ?? "",
    source: lead.source ?? "",
  };

  const [inserted] = await db
    .insert(outreachMessages)
    .values({
      leadId,
      subject,
      body,
      messageHash,
      generationContext,
      generatedBy: MODEL,
      status: "pending_review",
      messageType: MESSAGE_TYPE,
      messageVersionHash: MESSAGE_VERSION,
    })
    .returning();

  await db
    .update(contractorLeads)
    .set({
      outreachStage: "message_ready",
      lastMessageTypeSent: MESSAGE_TYPE,
      updatedAt: new Date(),
    })
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

    const existingHashes = new Set(
      (
        await db
          .select({ hash: outreachMessages.messageHash })
          .from(outreachMessages)
      )
        .map((row) => row.hash ?? "")
        .filter(Boolean)
    );

    if (Array.isArray(body.lead_ids) && body.lead_ids.length > 0) {
      const leadIds = body.lead_ids.filter(Boolean);
      const skipIfExists = body.force_regenerate !== true;
      let generated = 0;
      let skipped = 0;
      let failed = 0;
      const results: Array<{ lead_id: string; ok: boolean; message_id?: string; skipped?: boolean; error?: string }> = [];

      for (const leadId of leadIds) {
        try {
          const result = await generateForLead(leadId, existingHashes, skipIfExists);
          results.push({
            lead_id: leadId,
            ok: result.ok,
            message_id: result.id,
            skipped: result.skipped,
            error: result.error,
          });
          if (result.skipped) skipped++;
          else if (result.ok) generated++;
          else failed++;
        } catch (err) {
          results.push({ lead_id: leadId, ok: false, error: err instanceof Error ? err.message : "Message generation failed" });
          failed++;
        }
      }

      return Response.json({ ok: true, data: { generated, skipped, failed, results } });
    }

    const leadId = body.lead_id;
    if (!leadId) {
      return Response.json({ ok: false, error: "lead_id_required" }, { status: 400 });
    }

    const lead = await loadLead(leadId);
    if (!lead) {
      return Response.json({ ok: false, error: "lead_not_found" }, { status: 404 });
    }
    if (!lead.email?.trim()) {
      return Response.json({ ok: false, error: "Missing email" }, { status: 400 });
    }

    const result = await generateForLead(leadId, existingHashes, body.force_regenerate !== true);
    if (!result.ok) {
      if (result.error === "Missing email") {
        return Response.json({ ok: false, error: "Missing email" }, { status: 400 });
      }
      if (result.error === "lead_not_found") {
        return Response.json({ ok: false, error: "lead_not_found" }, { status: 404 });
      }
      throw new Error(result.error ?? "Message generation failed");
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
        generationContext: outreachMessages.generationContext,
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
        generation_context: inserted.generationContext,
        status: inserted.status,
        created_at: inserted.createdAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    console.error("GENERATION ERROR:", err);
    return Response.json(
      { ok: false, error: "Message generation failed" },
      { status: 500 }
    );
  }
}

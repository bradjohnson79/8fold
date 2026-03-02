import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/drizzle";
import { aiEnforcementEvents } from "@/db/schema/aiEnforcementEvent";
import { disputes } from "@/db/schema/dispute";
import { internalAccountFlags } from "@/db/schema/internalAccountFlag";
import { users } from "@/db/schema/user";
import { v4Messages } from "@/db/schema/v4Message";
import { OPENAI_APPRAISAL_MODEL, getOpenAiClient } from "@/src/lib/openai";
import type { MessengerRole } from "@/src/services/v4/messengerService";

const outputSchema = z.object({
  misconductDetected: z.boolean(),
  category: z.string().default("NONE"),
  confidence: z.number().min(0).max(1).default(0),
  severity: z.number().int().min(1).max(5).default(1),
  evidenceExcerpts: z.array(z.string()).default([]),
  contextSummary: z.string().default(""),
});

function normalizeOutput(raw: z.infer<typeof outputSchema>) {
  return {
    misconductDetected: Boolean(raw.misconductDetected),
    category: String(raw.category ?? "NONE").trim() || "NONE",
    confidence: Math.max(0, Math.min(1, Number(raw.confidence ?? 0))),
    severity: Math.max(1, Math.min(5, Number(raw.severity ?? 1))),
    evidenceExcerpts: (Array.isArray(raw.evidenceExcerpts) ? raw.evidenceExcerpts : [])
      .map((v) => String(v ?? "").trim())
      .filter(Boolean)
      .slice(0, 4),
    contextSummary: String(raw.contextSummary ?? "").trim(),
  };
}

function heuristicFallback(input: { summaryText: string; chatBodies: string[] }) {
  const corpus = `${input.summaryText}\n${input.chatBodies.join("\n")}`.toLowerCase();
  const danger = ["kill", "hurt", "threat", "violence", "harass", "stalk", "attack", "weapon"];
  const hits = danger.filter((term) => corpus.includes(term));
  if (hits.length === 0) {
    return {
      misconductDetected: false,
      category: "NONE",
      confidence: 0,
      severity: 1,
      evidenceExcerpts: [] as string[],
      contextSummary: "No explicit high-risk misconduct terms detected.",
    };
  }

  return {
    misconductDetected: true,
    category: "THREATS_OR_HARASSMENT",
    confidence: hits.length >= 2 ? 0.9 : 0.7,
    severity: hits.length >= 2 ? 4 : 3,
    evidenceExcerpts: hits.slice(0, 2),
    contextSummary: `Heuristic detected potentially unsafe language: ${hits.join(", ")}`,
  };
}

async function detectWithGpt(input: { summaryText: string; chatBodies: string[] }) {
  const raw = (await getOpenAiClient().responses.create({
    model: OPENAI_APPRAISAL_MODEL,
    input: [
      {
        role: "system",
        content:
          "You are a safety classifier for internal moderation. Return JSON only with keys misconductDetected, category, confidence (0..1), severity (1..5), evidenceExcerpts (string[]), contextSummary.",
      },
      {
        role: "user",
        content: JSON.stringify({
          summaryText: input.summaryText,
          chatBodies: input.chatBodies,
          categories: ["HARASSMENT", "THREATS", "VIOLENCE", "NONE"],
        }),
      },
    ],
    reasoning: { effort: "low" },
    max_output_tokens: 320,
  })) as { output_text?: string };

  const text = String(raw.output_text ?? "").trim();
  if (!text) throw new Error("Empty misconduct classifier output");
  const parsed = outputSchema.parse(JSON.parse(text));
  return normalizeOutput(parsed);
}

export async function analyzeCompletionForMisconduct(input: {
  threadId: string;
  jobId: string;
  submittedByRole: MessengerRole;
  submittedByUserId: string;
  summaryText: string;
}) {
  const chatRows = await db
    .select({ body: v4Messages.body })
    .from(v4Messages)
    .where(and(eq(v4Messages.threadId, input.threadId), eq(v4Messages.senderRole, input.submittedByRole)))
    .orderBy(desc(v4Messages.createdAt))
    .limit(30);

  const chatBodies = chatRows.map((r) => String(r.body ?? "").trim()).filter(Boolean);

  let detection:
    | {
        misconductDetected: boolean;
        category: string;
        confidence: number;
        severity: number;
        evidenceExcerpts: string[];
        contextSummary: string;
      }
    | undefined;

  try {
    detection = await detectWithGpt({
      summaryText: input.summaryText,
      chatBodies,
    });
  } catch {
    detection = heuristicFallback({
      summaryText: input.summaryText,
      chatBodies,
    });
  }

  const severe = detection.misconductDetected && detection.severity >= 4 && detection.confidence >= 0.85;
  const flagged = detection.misconductDetected;

  let actionTaken: "NONE" | "FLAGGED" | "SUSPENDED" = "NONE";

  let disputeId: string | null = null;
  if (flagged) {
    disputeId = randomUUID();
    await db.insert(disputes).values({
      id: disputeId,
      userId: input.submittedByUserId,
      role: input.submittedByRole,
      jobId: input.jobId,
      conversationId: input.threadId,
      subject: severe ? "AI Misconduct Auto-Escalation" : "AI Misconduct Flag for Review",
      message: [
        `Category: ${detection.category}`,
        `Confidence: ${detection.confidence.toFixed(2)}`,
        `Severity: ${detection.severity}`,
        `Evidence: ${detection.evidenceExcerpts.join(" | ") || "N/A"}`,
        `Summary: ${detection.contextSummary || "N/A"}`,
      ].join("\n"),
      status: "OPEN",
      attachmentPointers: {
        source: "AI_ENFORCEMENT",
        excerpts: detection.evidenceExcerpts,
      },
      createdAt: new Date(),
    });

    await db.insert(internalAccountFlags).values({
      id: randomUUID(),
      userId: input.submittedByUserId,
      type: "MANUAL_REVIEW",
      status: "ACTIVE",
      reason: severe
        ? "AI misconduct severe signal: auto-suspended pending review"
        : "AI misconduct flagged for office review",
      disputeCaseId: disputeId,
      createdByUserId: "SYSTEM_AI",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    actionTaken = "FLAGGED";
  }

  if (severe) {
    await db
      .update(users)
      .set({
        status: "SUSPENDED" as any,
        accountStatus: "SUSPENDED_PENDING_REVIEW",
        suspensionReason: "AI misconduct threshold reached. Pending office review.",
        updatedAt: new Date(),
      })
      .where(eq(users.id, input.submittedByUserId));
    actionTaken = "SUSPENDED";
  }

  const eventId = randomUUID();
  await db.insert(aiEnforcementEvents).values({
    id: eventId,
    userId: input.submittedByUserId,
    jobId: input.jobId,
    conversationId: input.threadId,
    category: detection.category,
    confidence: detection.confidence,
    severity: detection.severity,
    evidenceExcerpt: detection.evidenceExcerpts.join(" | ").slice(0, 4000),
    contextSummary: detection.contextSummary,
    actionTaken,
    createdAt: new Date(),
  });

  return {
    eventId,
    disputeId,
    actionTaken,
    ...detection,
  };
}

import { createHash, randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/drizzle";
import { scoreAppraisals } from "@/db/schema/scoreAppraisal";
import { users } from "@/db/schema/user";
import { v4CompletionReports } from "@/db/schema/v4CompletionReport";
import { v4MessageThreads } from "@/db/schema/v4MessageThread";
import { OPENAI_APPRAISAL_MODEL, getOpenAiClient } from "@/src/lib/openai";

export type ScoreRole = "CONTRACTOR" | "POSTER";

const appraisalSchema = z.object({
  avgPunctuality: z.number().nullable().optional(),
  avgCommunication: z.number().nullable().optional(),
  avgQuality: z.number().nullable().optional(),
  avgCooperation: z.number().nullable().optional(),
  totalScore: z.number().nullable(),
});

type ContractorInput = {
  punctuality: number;
  communication: number;
  quality: number;
};

type PosterInput = {
  cooperation: number;
  communication: number;
};

function toOneDecimal(n: number | null): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

function deterministicAppraisalForContractor(rows: ContractorInput[]) {
  const avgPunctuality = avg(rows.map((r) => r.punctuality));
  const avgCommunication = avg(rows.map((r) => r.communication));
  const avgQuality = avg(rows.map((r) => r.quality));
  const total = avg([avgPunctuality, avgCommunication, avgQuality].filter((v): v is number => v != null));
  return {
    avgPunctuality: toOneDecimal(avgPunctuality),
    avgCommunication: toOneDecimal(avgCommunication),
    avgQuality: toOneDecimal(avgQuality),
    avgCooperation: null,
    totalScore: toOneDecimal(total),
  };
}

function deterministicAppraisalForPoster(rows: PosterInput[]) {
  const avgCooperation = avg(rows.map((r) => r.cooperation));
  const avgCommunication = avg(rows.map((r) => r.communication));
  const total = avg([avgCooperation, avgCommunication].filter((v): v is number => v != null));
  return {
    avgPunctuality: null,
    avgCommunication: toOneDecimal(avgCommunication),
    avgQuality: null,
    avgCooperation: toOneDecimal(avgCooperation),
    totalScore: toOneDecimal(total),
  };
}

async function appraiseWithGpt(input: {
  role: ScoreRole;
  jobsEvaluated: number;
  reports: ContractorInput[] | PosterInput[];
}) {
  const systemPrompt = [
    "You are the 8Fold internal score appraisal engine.",
    "Return only strict JSON.",
    "Compute category averages and totalScore with one decimal.",
    "totalScore is the arithmetic mean of category averages.",
    "Do not include any explanation.",
  ].join(" ");

  const promptHash = createHash("sha256")
    .update(`${systemPrompt}:${JSON.stringify(input)}`)
    .digest("hex");

  const raw = (await getOpenAiClient().responses.create({
    model: OPENAI_APPRAISAL_MODEL,
    input: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: JSON.stringify({
          role: input.role,
          jobsEvaluated: input.jobsEvaluated,
          reports: input.reports,
          requiredJsonShape:
            input.role === "CONTRACTOR"
              ? {
                  avgPunctuality: 0,
                  avgCommunication: 0,
                  avgQuality: 0,
                  avgCooperation: null,
                  totalScore: 0,
                }
              : {
                  avgPunctuality: null,
                  avgCommunication: 0,
                  avgQuality: null,
                  avgCooperation: 0,
                  totalScore: 0,
                },
        }),
      },
    ],
    reasoning: { effort: "low" },
    max_output_tokens: 300,
  })) as { output_text?: string };

  const text = String(raw.output_text ?? "").trim();
  if (!text) throw new Error("Empty appraisal output");

  const parsed = appraisalSchema.parse(JSON.parse(text));
  return {
    promptHash,
    result: {
      avgPunctuality: toOneDecimal(parsed.avgPunctuality ?? null),
      avgCommunication: toOneDecimal(parsed.avgCommunication ?? null),
      avgQuality: toOneDecimal(parsed.avgQuality ?? null),
      avgCooperation: toOneDecimal(parsed.avgCooperation ?? null),
      totalScore: toOneDecimal(parsed.totalScore ?? null),
    },
  };
}

async function loadContractorInputs(userId: string) {
  const rows = await db
    .select({
      punctuality: v4CompletionReports.punctuality,
      communication: v4CompletionReports.communication,
      quality: v4CompletionReports.quality,
    })
    .from(v4CompletionReports)
    .innerJoin(v4MessageThreads, eq(v4MessageThreads.id, v4CompletionReports.threadId))
    .where(
      and(
        eq(v4MessageThreads.contractorUserId, userId),
        eq(v4CompletionReports.submittedByRole, "JOB_POSTER"),
        eq(v4MessageThreads.status, "ENDED"),
      ),
    )
    .orderBy(desc(v4CompletionReports.createdAt));

  return rows
    .filter(
      (r) =>
        typeof r.punctuality === "number" &&
        Number.isFinite(r.punctuality) &&
        typeof r.communication === "number" &&
        Number.isFinite(r.communication) &&
        typeof r.quality === "number" &&
        Number.isFinite(r.quality),
    )
    .map((r) => ({
      punctuality: Number(r.punctuality),
      communication: Number(r.communication),
      quality: Number(r.quality),
    }));
}

async function loadPosterInputs(userId: string) {
  const rows = await db
    .select({
      cooperation: v4CompletionReports.cooperation,
      communication: v4CompletionReports.communication,
    })
    .from(v4CompletionReports)
    .innerJoin(v4MessageThreads, eq(v4MessageThreads.id, v4CompletionReports.threadId))
    .where(
      and(
        eq(v4MessageThreads.jobPosterUserId, userId),
        eq(v4CompletionReports.submittedByRole, "CONTRACTOR"),
        eq(v4MessageThreads.status, "ENDED"),
      ),
    )
    .orderBy(desc(v4CompletionReports.createdAt));

  return rows
    .filter(
      (r) =>
        typeof r.cooperation === "number" &&
        Number.isFinite(r.cooperation) &&
        typeof r.communication === "number" &&
        Number.isFinite(r.communication),
    )
    .map((r) => ({
      cooperation: Number(r.cooperation),
      communication: Number(r.communication),
    }));
}

async function upsertPending(userId: string, role: ScoreRole, jobsEvaluated: number) {
  const now = new Date();
  await db
    .insert(scoreAppraisals)
    .values({
      id: randomUUID(),
      userId,
      role,
      jobsEvaluated,
      avgPunctuality: null,
      avgCommunication: null,
      avgQuality: null,
      avgCooperation: null,
      totalScore: null,
      promptHash: null,
      version: "v1",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [scoreAppraisals.userId, scoreAppraisals.role],
      set: {
        jobsEvaluated,
        avgPunctuality: null,
        avgCommunication: null,
        avgQuality: null,
        avgCooperation: null,
        totalScore: null,
        promptHash: null,
        version: "v1",
        updatedAt: now,
      },
    });
}

export async function recomputeScoreAppraisalForUser(userId: string, role: ScoreRole) {
  const inputs = role === "CONTRACTOR" ? await loadContractorInputs(userId) : await loadPosterInputs(userId);
  const jobsEvaluated = inputs.length;

  if (jobsEvaluated < 3) {
    await upsertPending(userId, role, jobsEvaluated);
    return {
      pending: true as const,
      jobsEvaluated,
      minimumRequired: 3,
    };
  }

  let promptHash: string | null = null;
  let version = "v1";
  let scored:
    | {
        avgPunctuality: number | null;
        avgCommunication: number | null;
        avgQuality: number | null;
        avgCooperation: number | null;
        totalScore: number | null;
      }
    | undefined;

  try {
    const ai = await appraiseWithGpt({
      role,
      jobsEvaluated,
      reports: inputs,
    });
    promptHash = ai.promptHash;
    scored = ai.result;
    version = "v1-gpt-5-nano";
  } catch {
    scored =
      role === "CONTRACTOR"
        ? deterministicAppraisalForContractor(inputs as ContractorInput[])
        : deterministicAppraisalForPoster(inputs as PosterInput[]);
    version = "v1-fallback";
  }

  const now = new Date();

  await db
    .insert(scoreAppraisals)
    .values({
      id: randomUUID(),
      userId,
      role,
      jobsEvaluated,
      avgPunctuality: scored.avgPunctuality,
      avgCommunication: scored.avgCommunication,
      avgQuality: scored.avgQuality,
      avgCooperation: scored.avgCooperation,
      totalScore: scored.totalScore,
      promptHash,
      version,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [scoreAppraisals.userId, scoreAppraisals.role],
      set: {
        jobsEvaluated,
        avgPunctuality: scored.avgPunctuality,
        avgCommunication: scored.avgCommunication,
        avgQuality: scored.avgQuality,
        avgCooperation: scored.avgCooperation,
        totalScore: scored.totalScore,
        promptHash,
        version,
        updatedAt: now,
      },
    });

  if (role === "POSTER" && typeof scored.totalScore === "number" && scored.totalScore < 5) {
    await db
      .update(users)
      .set({
        status: "SUSPENDED" as any,
        accountStatus: "SUSPENDED_PENDING_REVIEW",
        suspensionReason: "Score appraisal below minimum threshold (pending office review)",
        updatedAt: now,
      })
      .where(eq(users.id, userId));
  }

  return {
    pending: false as const,
    jobsEvaluated,
    minimumRequired: 3,
    appraisal: scored,
    version,
  };
}

export async function getScoreAppraisalForUser(userId: string, role: ScoreRole) {
  const rows = await db
    .select({
      jobsEvaluated: scoreAppraisals.jobsEvaluated,
      avgPunctuality: scoreAppraisals.avgPunctuality,
      avgCommunication: scoreAppraisals.avgCommunication,
      avgQuality: scoreAppraisals.avgQuality,
      avgCooperation: scoreAppraisals.avgCooperation,
      totalScore: scoreAppraisals.totalScore,
      version: scoreAppraisals.version,
      updatedAt: scoreAppraisals.updatedAt,
    })
    .from(scoreAppraisals)
    .where(and(eq(scoreAppraisals.userId, userId), eq(scoreAppraisals.role, role)))
    .limit(1);

  const row = rows[0] ?? null;
  if (!row) {
    const refreshed = await recomputeScoreAppraisalForUser(userId, role);
    if (refreshed.pending) {
      return {
        pending: true,
        jobsEvaluated: refreshed.jobsEvaluated,
        minimumRequired: refreshed.minimumRequired,
      };
    }
    return {
      pending: false,
      jobsEvaluated: refreshed.jobsEvaluated,
      minimumRequired: refreshed.minimumRequired,
      appraisal: refreshed.appraisal,
      version: refreshed.version,
    };
  }

  if (Number(row.jobsEvaluated ?? 0) < 3 || row.totalScore == null) {
    return {
      pending: true,
      jobsEvaluated: Number(row.jobsEvaluated ?? 0),
      minimumRequired: 3,
    };
  }

  return {
    pending: false,
    jobsEvaluated: Number(row.jobsEvaluated ?? 0),
    minimumRequired: 3,
    appraisal: {
      avgPunctuality: toOneDecimal(row.avgPunctuality),
      avgCommunication: toOneDecimal(row.avgCommunication),
      avgQuality: toOneDecimal(row.avgQuality),
      avgCooperation: toOneDecimal(row.avgCooperation),
      totalScore: toOneDecimal(row.totalScore),
    },
    version: row.version,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
  };
}

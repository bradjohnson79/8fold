import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { roleTermsAcceptances } from "@/db/schema/roleTermsAcceptance";

export const TERMS_DOCUMENT_TYPE = {
  JOB_POSTER: "JOB_POSTER_TERMS",
  CONTRACTOR: "CONTRACTOR_TERMS",
  ROUTER: "ROUTER_TERMS",
} as const;

export const CURRENT_TERMS_VERSION = {
  JOB_POSTER: "1.0",
  CONTRACTOR: "v1.1",
  ROUTER: "v1.0",
} as const;

export type CompletionRole = keyof typeof TERMS_DOCUMENT_TYPE;
export type TermsDocumentType = (typeof TERMS_DOCUMENT_TYPE)[CompletionRole];

function normalizeRole(role: string): CompletionRole | null {
  const up = role.trim().toUpperCase();
  if (up === "JOB_POSTER" || up === "CONTRACTOR" || up === "ROUTER") return up;
  return null;
}

function isMissingRelationOrColumn(error: unknown): boolean {
  const cause = (error as any)?.cause;
  const code = String((error as any)?.code ?? cause?.code ?? "");
  if (code === "42P01" || code === "42703") return true;
  const message = String((error as any)?.message ?? cause?.message ?? "").toLowerCase();
  return message.includes("does not exist");
}

export async function recordRoleTermsAcceptance(args: {
  userId: string;
  role: CompletionRole;
  version: string;
  acceptedAt?: Date;
}) {
  const acceptedAt = args.acceptedAt ?? new Date();
  const version = String(args.version ?? "").trim();
  if (!version) return;
  const documentType = TERMS_DOCUMENT_TYPE[args.role];

  try {
    await db
      .insert(roleTermsAcceptances)
      .values({
        id: randomUUID(),
        userId: args.userId,
        role: args.role,
        documentType,
        version,
        acceptedAt,
        createdAt: new Date(),
      })
      .onConflictDoNothing({
        target: [
          roleTermsAcceptances.userId,
          roleTermsAcceptances.role,
          roleTermsAcceptances.documentType,
          roleTermsAcceptances.version,
        ],
      });
  } catch (error) {
    if (!isMissingRelationOrColumn(error)) throw error;
    console.warn("[role-terms] role_terms_acceptances unavailable; skipping acceptance write");
  }
}

export async function hasCurrentRoleTermsAcceptance(userId: string, roleRaw: string): Promise<boolean> {
  const role = normalizeRole(roleRaw);
  if (!role) return false;

  const version = CURRENT_TERMS_VERSION[role];
  const documentType = TERMS_DOCUMENT_TYPE[role];

  let rows: Array<{ id: string }>;
  try {
    rows = await db
      .select({
        id: roleTermsAcceptances.id,
      })
      .from(roleTermsAcceptances)
      .where(
        and(
          eq(roleTermsAcceptances.userId, userId),
          eq(roleTermsAcceptances.role, role),
          eq(roleTermsAcceptances.documentType, documentType),
          eq(roleTermsAcceptances.version, version),
        ),
      )
      .orderBy(desc(roleTermsAcceptances.acceptedAt))
      .limit(1);
  } catch (error) {
    if (!isMissingRelationOrColumn(error)) throw error;
    console.warn("[role-terms] role_terms_acceptances unavailable; treating terms as not accepted");
    return false;
  }

  return Boolean(rows[0]?.id);
}

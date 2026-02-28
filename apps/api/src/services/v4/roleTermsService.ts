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
  CONTRACTOR: "v1.0",
  ROUTER: "v1.0",
} as const;

export type CompletionRole = keyof typeof TERMS_DOCUMENT_TYPE;
export type TermsDocumentType = (typeof TERMS_DOCUMENT_TYPE)[CompletionRole];

function normalizeRole(role: string): CompletionRole | null {
  const up = role.trim().toUpperCase();
  if (up === "JOB_POSTER" || up === "CONTRACTOR" || up === "ROUTER") return up;
  return null;
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
}

export async function hasCurrentRoleTermsAcceptance(userId: string, roleRaw: string): Promise<boolean> {
  const role = normalizeRole(roleRaw);
  if (!role) return false;

  const version = CURRENT_TERMS_VERSION[role];
  const documentType = TERMS_DOCUMENT_TYPE[role];

  const rows = await db
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

  return Boolean(rows[0]?.id);
}


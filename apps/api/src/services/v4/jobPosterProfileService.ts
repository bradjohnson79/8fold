import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobPosters } from "@/db/schema/jobPoster";
import { jobPosterProfilesV4 } from "@/db/schema/jobPosterProfileV4";
import { users } from "@/db/schema/user";
import { badRequest, conflict, internal, type V4Error } from "@/src/services/v4/v4Errors";
import { type V4JobPosterProfileInput } from "@/src/validation/v4/jobPosterProfileSchema";
import type { ClerkIdentity } from "@/src/auth/getClerkIdentity";

function isMissingRelationOrColumn(error: unknown): boolean {
  const cause = (error as any)?.cause;
  const code = String((error as any)?.code ?? cause?.code ?? "");
  if (code === "42P01" || code === "42703") return true;
  const message = String((error as any)?.message ?? cause?.message ?? "").toLowerCase();
  return message.includes("does not exist");
}

function emptyV4JobPosterProfile() {
  return {
    ok: true as const,
    profile: {
      phone: "",
      country: "",
      region: "",
      city: "",
      address: "",
      latitude: null,
      longitude: null,
      firstName: "",
      lastName: "",
      email: "",
      addressLine1: "",
      cityLegacy: "",
      provinceState: "",
      postalCode: "",
      formattedAddress: "",
    },
  };
}

function mapJobPosterProfileDbError(err: unknown): V4Error {
  const cause = (err as any)?.cause ?? err;
  const pgCode = String((cause as any)?.code ?? "");

  if (pgCode === "23502") {
    return badRequest(
      "V4_JOB_POSTER_PROFILE_REQUIRED_FIELD_MISSING",
      "One or more required job poster profile fields are missing.",
      { column: (cause as any)?.column ?? null },
    );
  }

  if (pgCode === "23503") {
    return conflict(
      "V4_JOB_POSTER_PROFILE_USER_LINK_INVALID",
      "Job poster account link is invalid. Please refresh and try again.",
      { constraint: (cause as any)?.constraint ?? null },
    );
  }

  if (pgCode === "23505") {
    return conflict(
      "V4_JOB_POSTER_PROFILE_CONFLICT",
      "A conflicting profile record exists. Please refresh and try again.",
      { constraint: (cause as any)?.constraint ?? null },
    );
  }

  if (pgCode === "22P02" || pgCode === "22003") {
    return badRequest("V4_JOB_POSTER_PROFILE_INVALID_DATA", "Invalid job poster profile values provided.");
  }

  return internal("V4_JOB_POSTER_PROFILE_SAVE_FAILED");
}

export async function getV4JobPosterProfile(userId: string) {
  let rows;
  try {
    rows = await db
      .select()
      .from(jobPosterProfilesV4)
      .where(eq(jobPosterProfilesV4.userId, userId))
      .limit(1);
  } catch (error) {
    if (!isMissingRelationOrColumn(error)) throw error;
    console.warn("[job-poster-profile] profile table/column unavailable; returning empty profile");
    return emptyV4JobPosterProfile();
  }
  const row = rows[0] ?? null;
  const country = String(row?.country ?? "").toUpperCase();
  return {
    ok: true as const,
    profile: {
      phone: String(row?.phone ?? "").trim(),
      country: country === "US" || country === "CA" ? country : "",
      region: String(row?.provinceState ?? "")
        .trim()
        .toUpperCase(),
      city: String(row?.city ?? "").trim(),
      address: String(row?.formattedAddress ?? row?.addressLine1 ?? "").trim(),
      latitude: row?.latitude ?? null,
      longitude: row?.longitude ?? null,

      // Backward-compatible fields still used by existing setup/post-job consumers.
      firstName: String(row?.firstName ?? "").trim(),
      lastName: String(row?.lastName ?? "").trim(),
      email: String(row?.email ?? "").trim(),
      addressLine1: String(row?.addressLine1 ?? "").trim(),
      cityLegacy: String(row?.city ?? "").trim(),
      provinceState: String(row?.provinceState ?? "")
        .trim()
        .toUpperCase(),
      postalCode: String(row?.postalCode ?? "").trim(),
      formattedAddress: String(row?.formattedAddress ?? "").trim(),
    },
  };
}

export async function saveV4JobPosterProfile(
  userId: string,
  input: V4JobPosterProfileInput,
  identity?: ClerkIdentity | null,
) {
  const now = new Date();
  const contactName = [identity?.firstName, identity?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const normalizedCountry = input.country.toUpperCase() === "CA" ? "CA" : "US";
  const normalizedRegion = input.region.trim().toUpperCase();
  const normalizedIdentityEmail = String(identity?.email ?? "").trim().toLowerCase() || null;

  let safeEmailForUpdate: string | null = null;
  if (normalizedIdentityEmail) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${normalizedIdentityEmail}`)
      .limit(1);
    const emailOwnerId = existing[0]?.id ?? null;
    if (!emailOwnerId || emailOwnerId === userId) {
      safeEmailForUpdate = normalizedIdentityEmail;
    } else {
      console.warn("[job-poster-profile] skipping user.email sync due to ownership conflict", {
        userId,
        email: normalizedIdentityEmail,
        emailOwnerId,
      });
    }
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          ...(contactName ? { name: contactName } : {}),
          ...(safeEmailForUpdate ? { email: safeEmailForUpdate } : {}),
          phone: input.phone.trim(),
          formattedAddress: input.address,
          latitude: input.latitude as any,
          longitude: input.longitude as any,
          legalStreet: input.address,
          legalCity: input.city,
          legalProvince: normalizedRegion,
          legalCountry: normalizedCountry,
          country: normalizedCountry as any,
          countryCode: normalizedCountry as any,
          stateCode: normalizedRegion,
          updatedAt: now,
        } as any)
        .where(eq(users.id, userId));

      await tx
        .insert(jobPosters)
        .values({
          userId,
          isActive: true,
          defaultRegion: normalizedRegion,
          createdAt: now,
        } as any)
        .onConflictDoUpdate({
          target: jobPosters.userId,
          set: {
            isActive: true,
            defaultRegion: normalizedRegion,
          } as any,
        });

      await tx
        .insert(jobPosterProfilesV4)
        .values({
          id: randomUUID(),
          userId,
          firstName: identity?.firstName ?? null,
          lastName: identity?.lastName ?? null,
          email: identity?.email ?? null,
          avatarUrl: identity?.avatarUrl ?? null,
          phone: input.phone.trim(),
          addressLine1: input.address,
          addressLine2: null,
          city: input.city,
          provinceState: normalizedRegion,
          postalCode: "",
          country: normalizedCountry,
          formattedAddress: input.address,
          latitude: input.latitude,
          longitude: input.longitude,
          geocodeProvider: "GOOGLE_PLACES",
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: jobPosterProfilesV4.userId,
          set: {
            phone: input.phone.trim(),
            addressLine1: input.address,
            addressLine2: null,
            city: input.city,
            provinceState: normalizedRegion,
            country: normalizedCountry,
            formattedAddress: input.address,
            latitude: input.latitude,
            longitude: input.longitude,
            geocodeProvider: "GOOGLE_PLACES",
            updatedAt: now,
            // Identity: backfill on first save only; do NOT update on conflict
          },
        });
    });
  } catch (err) {
    throw mapJobPosterProfileDbError(err);
  }

  return getV4JobPosterProfile(userId);
}

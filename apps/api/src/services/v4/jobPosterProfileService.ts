import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobPosters } from "@/db/schema/jobPoster";
import { jobPosterProfilesV4 } from "@/db/schema/jobPosterProfileV4";
import { users } from "@/db/schema/user";
import { type V4JobPosterProfileInput } from "@/src/validation/v4/jobPosterProfileSchema";
import type { ClerkIdentity } from "@/src/auth/getClerkIdentity";

export async function getV4JobPosterProfile(userId: string) {
  const rows = await db
    .select()
    .from(jobPosterProfilesV4)
    .where(eq(jobPosterProfilesV4.userId, userId))
    .limit(1);
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
  const contactName = [identity?.firstName, identity?.lastName].filter(Boolean).join(" ").trim();
  const contactName = [identity?.firstName, identity?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const normalizedCountry = input.country.toUpperCase() === "CA" ? "CA" : "US";
  const normalizedRegion = input.region.trim().toUpperCase();

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        ...(contactName ? { name: contactName } : {}),
        ...(identity?.email ? { email: identity.email } : {}),
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

  return getV4JobPosterProfile(userId);
}

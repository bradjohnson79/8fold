/**
 * Fetches Clerk user identity for profile sync. Used in route layer only.
 * Services must NOT call Clerk; identity is passed as parameters.
 */
import { clerkClient } from "@clerk/nextjs/server";

export type ClerkIdentity = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  avatarUrl: string | null;
};

export async function getClerkIdentity(clerkUserId: string): Promise<ClerkIdentity> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(clerkUserId);
    const primaryEmail = user.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId);
    return {
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      email: primaryEmail?.emailAddress ?? null,
      avatarUrl: user.imageUrl ?? null,
    };
  } catch {
    return { firstName: null, lastName: null, email: null, avatarUrl: null };
  }
}

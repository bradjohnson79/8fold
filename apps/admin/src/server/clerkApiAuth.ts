import { auth } from "@clerk/nextjs/server";

export async function getAdminBearerToken(): Promise<string> {
  const { userId, getToken } = await auth();
  if (!userId) throw Object.assign(new Error("Unauthorized"), { status: 401 });

  const token = await getToken();
  if (!token) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  return token;
}

export async function getAdminAuthHeader(): Promise<string> {
  const token = await getAdminBearerToken();
  return `Bearer ${token}`;
}

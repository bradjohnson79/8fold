import { cookies } from "next/headers";

export const LGS_SESSION_COOKIE_NAME = "lgs_session";

export async function getLgsSessionToken(): Promise<string | null> {
  const token = (await cookies()).get(LGS_SESSION_COOKIE_NAME)?.value?.trim() ?? "";
  if (!token) return null;
  const segments = token.split(".");
  const isJwtFormat = segments.length === 3 && segments.every((s) => s.length > 0);
  if (!isJwtFormat) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[LGS_SESSION_INVALID_FORMAT]");
    }
    return null;
  }
  return token;
}

export async function getLgsAuthHeader(): Promise<string> {
  const token = await getLgsSessionToken();
  if (!token) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  return `Bearer ${token}`;
}

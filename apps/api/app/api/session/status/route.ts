import { NextResponse } from "next/server";
import crypto from "crypto";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { toHttpError } from "../../../../src/http/errors";

function getAuthDbSchema(): string | null {
  const url = process.env.DATABASE_URL ?? "";
  try {
    const u = new URL(url);
    const s = u.searchParams.get("schema");
    return s && /^[a-zA-Z0-9_]+$/.test(s) ? s : null;
  } catch {
    return null;
  }
}

const AUTH_SCHEMA = getAuthDbSchema() ?? "public";
const SESSION_T = sql.raw(`"${AUTH_SCHEMA}"."Session"`);

function parseCookieHeader(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    out[k] = rest.join("=") ?? "";
  }
  return out;
}

function getSessionTokenFromRequest(req: Request): string | null {
  const authz = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (authz && authz.toLowerCase().startsWith("bearer ")) {
    const token = authz.slice(7).trim();
    return token.length > 0 ? token : null;
  }
  const header = req.headers.get("x-session-token");
  if (header && header.trim().length > 0) return header.trim();
  const cookies = parseCookieHeader(req.headers.get("cookie"));
  const sidRaw = cookies["sid"] ?? "";
  if (!sidRaw) return null;
  try {
    const sid = decodeURIComponent(sidRaw);
    return sid && sid.trim().length > 0 ? sid.trim() : null;
  } catch {
    return null;
  }
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function asDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") return new Date(v);
  return new Date(v as any);
}

export async function GET(req: Request) {
  try {
    const token = getSessionTokenFromRequest(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const tokenHash = sha256(token);
    const res = await db.execute(sql`
      select "expiresAt", "revokedAt"
      from ${SESSION_T}
      where "sessionTokenHash" = ${tokenHash}
      limit 1
    `);
    const row = (res.rows[0] ?? null) as { expiresAt: unknown; revokedAt: unknown | null } | null;
    if (!row) {
      return NextResponse.json({ ok: false, error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }
    const revokedAt = row.revokedAt ? asDate(row.revokedAt) : null;
    if (revokedAt) {
      return NextResponse.json({ ok: false, error: "Unauthorized", code: "SESSION_REVOKED" }, { status: 401 });
    }

    const expiresAt = asDate(row.expiresAt);
    const timeRemainingSeconds = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    if (timeRemainingSeconds <= 0) {
      return NextResponse.json({ ok: false, error: "Unauthorized", code: "SESSION_EXPIRED" }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      expiresAt: expiresAt.toISOString(),
      timeRemainingSeconds,
    });
  } catch (err) {
    const { status, message, code, context } = toHttpError(err);
    return NextResponse.json({ ok: false, error: message, code, context }, { status });
  }
}


import { NextResponse } from "next/server";
import crypto from "node:crypto";
import "@/server/commands/appApiCatchallHandlers";
import { bus } from "@/server/bus/bus";
import { BusError } from "@/server/bus/errors";
import { apiFetch } from "@/server/api/apiClient";

function jsonError(e: unknown) {
  const anyErr = e as any;
  const cause = anyErr?.cause;
  const status =
    // Prefer original/cause status when a handler wrapper is used.
    anyErr?.code === "HANDLER_FAILED" && typeof cause?.status === "number"
      ? cause.status
      : anyErr?.code === "HANDLER_FAILED" && cause instanceof BusError
        ? cause.status
        : typeof anyErr?.status === "number"
          ? anyErr.status
          : e instanceof BusError
            ? e.status
            : typeof cause?.status === "number"
              ? cause.status
              : cause instanceof BusError
                ? cause.status
                : 500;
  const msg =
    typeof anyErr?.message === "string"
      ? anyErr.message
      : typeof cause?.message === "string"
        ? cause.message
        : "Error";
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/** Allowlist: paths that bypass 404 and proxy to API (no auth). Used when catchall matches before specific route. */
function isDiagBuild(pathSegments: string[]): boolean {
  return pathSegments.length === 2 && pathSegments[0] === "diag" && pathSegments[1] === "build";
}

async function handleDiagBuild(): Promise<Response> {
  const traceId = crypto.randomUUID();
  try {
    const resp = await apiFetch({ path: "/api/diag/build", method: "GET" });
    const text = await resp.text();
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        code: "BUILD_DIAG_PROXY_FAILED",
        traceId,
        message: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    const params = await ctx.params;
    const pathSegments = params?.path ?? [];
    const path = `/${pathSegments.join("/")}`;

    if (isDiagBuild(pathSegments)) {
      return handleDiagBuild();
    }

    const requestId = crypto.randomUUID();
    await bus.dispatch({ type: "app.api.notFound", payload: { path }, context: { requestId, now: new Date() } });
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    const params = await ctx.params;
    const path = `/${(params?.path ?? []).join("/")}`;
    const requestId = crypto.randomUUID();
    await bus.dispatch({ type: "app.api.notFound", payload: { path }, context: { requestId, now: new Date() } });
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return POST(req, ctx);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return POST(req, ctx);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return POST(req, ctx);
}


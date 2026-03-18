import { NextRequest } from "next/server";
import { proxyToApiRaw } from "@/server/api/proxy";

export async function POST(req: NextRequest) {
  return proxyToApiRaw("/api/lgs/leads/archive", req);
}

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import "@/server/commands/publicDiscoveryHandlers";
import { bus } from "@/server/bus/bus";

const CA_PROVINCE_CODES_10 = new Set(["AB", "BC", "MB", "NB", "NL", "NS", "ON", "PE", "QC", "SK"]);
const US_STATE_CODES_50 = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
]);

function isAllowedRegion(region: string): boolean {
  const rc = region.trim().toUpperCase();
  return US_STATE_CODES_50.has(rc) || CA_PROVINCE_CODES_10.has(rc);
}

export async function GET(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(req.url);
    const region = String(url.searchParams.get("region") ?? "").trim().toUpperCase();

    if (!region || region.length !== 2) {
      return NextResponse.json(
        { ok: false, error: "Invalid region: must be a 2-letter region code", code: "INVALID_INPUT", requestId },
        { status: 400 }
      );
    }

    if (!isAllowedRegion(region)) {
      return NextResponse.json(
        { ok: false, error: "Invalid region: unknown region code", code: "INVALID_INPUT", requestId },
        { status: 400 }
      );
    }

    const out = await bus.dispatch({
      type: "public.jobs.cities",
      payload: { region },
      context: { requestId, now: new Date() },
    });

    return NextResponse.json(out, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Failed to load cities", code: "INTERNAL_ERROR", requestId },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import {
  ingestInboundOutreachEvent,
  type InboundOutreachEventInput,
} from "@/src/services/lgs/inboundOutreachService";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      event_type?: "reply" | "bounce";
      campaign_type?: "contractor" | "jobs";
      provider?: string;
      external_event_id?: string;
      from_email?: string;
      to_email?: string;
      contact_email?: string;
      sender_email?: string;
      subject?: string;
      body?: string;
      occurred_at?: string;
      raw_payload?: unknown;
    };

    if (body.event_type !== "reply" && body.event_type !== "bounce") {
      return NextResponse.json({ ok: false, error: "event_type_invalid" }, { status: 400 });
    }

    const result = await ingestInboundOutreachEvent({
      eventType: body.event_type,
      campaignType: body.campaign_type,
      provider: body.provider,
      externalEventId: body.external_event_id,
      fromEmail: body.from_email,
      toEmail: body.to_email,
      contactEmail: body.contact_email,
      senderEmail: body.sender_email,
      subject: body.subject,
      body: body.body,
      occurredAt: body.occurred_at,
      rawPayload: body.raw_payload,
    } satisfies InboundOutreachEventInput);

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    console.error("[LGS Reply] Inbound route error:", error);
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "contact_email_and_sender_email_required" ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

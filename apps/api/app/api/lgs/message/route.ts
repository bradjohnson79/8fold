import {
  handleSingleMessageGeneration,
  type SingleMessageRequestBody,
} from "@/src/services/lgs/messageGenerationRequestService";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as SingleMessageRequestBody;
    return handleSingleMessageGeneration(body);
  } catch (err) {
    console.error("SINGLE MESSAGE GENERATION ERROR:", err);
    return Response.json({ ok: false, error: "Message generation failed" }, { status: 500 });
  }
}

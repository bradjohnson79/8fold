import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { adminGetSupportTicketWithMessages } from "@/src/services/v4/v4SupportService";
import { getOpenAiClient, OPENAI_APPRAISAL_MODEL } from "@/src/lib/openai";
import { err, ok } from "@/src/lib/api/adminV4Response";

const SYSTEM_PROMPT = `You are Kathy, a friendly and professional support representative at 8Fold, a contractor marketplace.

8Fold key policies:
- Contractors keep 80% on local jobs, up to 85% on regional jobs
- No lead fees, no bidding wars
- Routers earn 8% commission per completed job
- Escrow-protected payments; funds released after job completion
- Support tickets: contractors, routers, and job posters can open tickets for any issue

8Fold is currently in Phase 1 of the California launch. Contractors may not yet see jobs until routing begins.
Keep responses consistent with this phase.

Respond clearly and helpfully. Sign all replies as:
Kathy
8Fold Support Team`;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ ticketId: string }> },
) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { ticketId } = await ctx.params;

  const result = await adminGetSupportTicketWithMessages(ticketId);
  if (!result) return err(404, "ADMIN_V4_SUPPORT_TICKET_NOT_FOUND", "Ticket not found");

  const ticket = result.ticket as { subject?: string; body?: string; role?: string };
  const userMessage = String(ticket.body ?? "").slice(0, 1200);
  if (!userMessage.trim()) {
    return err(400, "ADMIN_V4_TICKET_EMPTY", "Ticket has no message to reply to");
  }

  const contextPrefix = ticket.subject
    ? `Support ticket subject: "${ticket.subject}". User role: ${ticket.role ?? "unknown"}.\n\nUser message:\n`
    : "User message:\n";

  try {
    const client = getOpenAiClient();
    const raw = (await client.responses.create({
      model: OPENAI_APPRAISAL_MODEL,
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: contextPrefix + userMessage },
      ],
      reasoning: { effort: "low" },
      max_output_tokens: 600,
    })) as { output_text?: string };

    const suggestedReply = typeof raw?.output_text === "string" ? raw.output_text.trim() : "";
    if (!suggestedReply) {
      return err(500, "ADMIN_V4_AI_EMPTY", "AI returned an empty reply");
    }

    return ok({ suggestedReply });
  } catch (e) {
    console.error("[ADMIN_V4_AI_REPLY_ERROR]", e instanceof Error ? e.message : String(e));
    return err(500, "ADMIN_V4_AI_FAILED", "Failed to generate reply");
  }
}

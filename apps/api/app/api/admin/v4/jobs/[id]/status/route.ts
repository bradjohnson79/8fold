import { POST as updateStatusPost } from "../route";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return await updateStatusPost(req, ctx);
}


import { redirect } from "next/navigation";

export default async function JobPosterThreadRedirectPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  redirect(`/dashboard/job-poster/messages?threadId=${encodeURIComponent(threadId)}`);
}

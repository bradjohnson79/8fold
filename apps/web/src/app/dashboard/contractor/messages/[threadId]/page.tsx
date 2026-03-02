import { redirect } from "next/navigation";

export default async function ContractorThreadRedirectPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  redirect(`/dashboard/contractor/messages?threadId=${encodeURIComponent(threadId)}`);
}

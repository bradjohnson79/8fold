import { redirect } from "next/navigation";
import { requireServerSession } from "@/server/auth/requireServerSession";
import { auth } from "@clerk/nextjs/server";

export default async function SupportLayout({ children }: { children: React.ReactNode }) {
  // Legacy path: redirect into role-specific support areas to preserve stable role sidebar.
  let session;
  try {
    session = await requireServerSession();
  } catch {
    session = null;
  }

  if (!session?.userId) {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) return <>{children}</>;
    // Signed-in user but session not ready: stabilize in /app.
    redirect("/app");
  }

  const role = String(session?.role ?? "").trim().toUpperCase();
  if (role === "ROUTER") redirect("/app/router/support");
  if (role === "CONTRACTOR") redirect("/app/contractor/support");
  if (role === "JOB_POSTER") redirect("/app/job-poster/support");

  // Fallback: render without shell (e.g. unauthenticated).
  return <>{children}</>;
}


import { redirect } from "next/navigation";
import { requireServerSession } from "@/server/auth/requireServerSession";

export default async function SupportLayout({ children }: { children: React.ReactNode }) {
  // Legacy path: redirect into role-specific support areas to preserve stable role sidebar.
  let session;
  try {
    session = await requireServerSession();
  } catch {
    session = null;
  }

  const role = String(session?.role ?? "").trim().toUpperCase();
  if (role === "ROUTER") redirect("/app/router/support");
  if (role === "CONTRACTOR") redirect("/app/contractor/support");
  if (role === "JOB_POSTER") redirect("/app/job-poster/support");

  // Fallback: render without shell (e.g. unauthenticated).
  return <>{children}</>;
}


import { redirect } from "next/navigation";
import { getAdminOrigin } from "@/server/api/apiClient";

export default function AdminRedirectPage() {
  // In dev, Admin runs on a separate origin (:3002).
  // In prod, ADMIN_ORIGIN can point to the real admin host.
  redirect(getAdminOrigin());
}


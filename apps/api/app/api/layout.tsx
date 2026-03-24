import type { ReactNode } from "react";

export const runtime = "nodejs";

export default function ApiLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

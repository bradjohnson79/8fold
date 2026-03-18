"use client";

import { usePathname } from "next/navigation";
import { NavBar } from "./NavBar";

const AUTH_ROUTES = ["/login", "/lgs-signup", "/403"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <>
      <NavBar />
      <main style={{ padding: "2rem", maxWidth: 1200, margin: "0 auto" }}>{children}</main>
    </>
  );
}

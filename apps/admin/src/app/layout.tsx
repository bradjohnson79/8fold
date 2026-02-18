import "./globals.css";
import { ThemeInit } from "@/components/theme/ThemeInit";

export const metadata = {
  title: "8Fold Admin",
  description: "8Fold Control Plane",
};

// Clerk configuration is provided at runtime via environment variables.
// Force dynamic rendering so build does not prerender auth-gated pages without env.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeInit />
        {children}
      </body>
    </html>
  );
}

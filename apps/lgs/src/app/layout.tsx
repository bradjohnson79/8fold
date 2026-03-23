import "./globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata = {
  title: "8Fold LGS — Lead Generation System",
  description: "Contractor acquisition, outreach tracking, and operating metrics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

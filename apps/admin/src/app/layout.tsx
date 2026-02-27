import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeInit } from "@/components/theme/ThemeInit";

export const metadata = {
  title: "8Fold Admin",
  description: "8Fold Control Plane",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider>
          <ThemeInit />
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}

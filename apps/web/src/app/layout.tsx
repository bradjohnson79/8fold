import type { Metadata } from 'next'
import './globals.css'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { ClerkProvider } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: '8Fold Local - Earn Money Routing Jobs',
  description: 'Claim one job at a time. Clear earnings shown upfront.',
}

function assertWebEnv(): void {
  // Env isolation: apps/web must be independently deployable.
  const k = String(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "").trim();
  if (!k) {
    throw new Error("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required (set it in apps/web/.env.local)");
  }
}

// Clerk configuration is provided at runtime via environment variables.
// Force dynamic rendering so build does not attempt to prerender auth-gated pages without env.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  assertWebEnv();
  return (
    <html lang="en">
      <body className="bg-white">
        <ClerkProvider
          telemetry={false}
          appearance={{
            variables: {
              colorPrimary: "#16a34a", // 8Fold green (approx)
              colorText: "#0f172a",
              colorBackground: "#ffffff",
              borderRadius: "12px",
            },
          }}
        >
          <Header />
          <main className="min-h-screen">{children}</main>
          <Footer />
        </ClerkProvider>
      </body>
    </html>
  )
}
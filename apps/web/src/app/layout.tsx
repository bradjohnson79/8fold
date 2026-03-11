import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import "leaflet/dist/leaflet.css";
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { BetaTicker } from '../components/BetaTicker'
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

interface SeoPublicSettings {
  metaPixelId: string | null;
  ga4MeasurementId: string | null;
  canonicalDomain: string | null;
  facebookUrl: string | null;
  twitterUrl: string | null;
  linkedinUrl: string | null;
}

async function fetchSeoSettings(): Promise<SeoPublicSettings | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return null;
  try {
    const res = await fetch(`${apiUrl}/api/public/seo-settings`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data ?? null;
  } catch {
    return null;
  }
}

// Clerk configuration is provided at runtime via environment variables.
// Force dynamic rendering so build does not attempt to prerender auth-gated pages without env.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  assertWebEnv();

  // Fail gracefully — if SEO API is down, site renders normally without tracking
  const seo = await fetchSeoSettings();

  // Env-var fallbacks ensure tracking fires even if the Admin SEO Engine DB row
  // hasn't been saved yet. DB value takes precedence when both are present.
  const pixelId = seo?.metaPixelId ?? process.env.NEXT_PUBLIC_META_PIXEL_ID ?? null;

  const sameAs = [seo?.facebookUrl, seo?.twitterUrl, seo?.linkedinUrl].filter(Boolean) as string[];
  const canonicalBase = `https://${seo?.canonicalDomain ?? "8fold.app"}`;

  return (
    <html lang="en">
      <head>
        {/* Google tag (gtag.js) — placed immediately after head per Google setup */}
        <Script
          id="google-tag"
          strategy="beforeInteractive"
          src="https://www.googletagmanager.com/gtag/js?id=G-WFMKDLCTE8"
        />
        <Script
          id="google-tag-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-WFMKDLCTE8');`,
          }}
        />
        {/* Organization JSON-LD — helps search engines associate brand with official social profiles */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "8Fold",
              url: canonicalBase,
              logo: `${canonicalBase}/logo.png`,
              ...(sameAs.length > 0 && { sameAs }),
            }),
          }}
        />
        {/* Meta Pixel — DB value or NEXT_PUBLIC_META_PIXEL_ID env var */}
        {pixelId && (
          <Script
            id="meta-pixel-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];
t=b.createElement(e);t.async=!0;t.src=v;
s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}
(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${pixelId}');
fbq('track','PageView');`,
            }}
          />
        )}
      </head>
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
          <BetaTicker />
          <Header />
          <main className="min-h-screen">{children}</main>
          <Footer
            facebookUrl={seo?.facebookUrl ?? null}
            twitterUrl={seo?.twitterUrl ?? null}
            linkedinUrl={seo?.linkedinUrl ?? null}
          />
        </ClerkProvider>
      </body>
    </html>
  )
}

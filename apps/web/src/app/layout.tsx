import './globals.css'

/**
 * Step 4: Minimal layout for hang diagnostic.
 * Original layout preserved in layout.disabled.tsx
 */
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

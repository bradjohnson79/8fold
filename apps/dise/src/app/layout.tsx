import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "DISE — Directory Intelligence & Submission Engine",
  description: "Internal ops tool for directory discovery and submission management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav style={{ padding: "1rem 2rem", borderBottom: "1px solid #334155", display: "flex", gap: "1.5rem", alignItems: "center" }}>
          <Link href="/" style={{ fontWeight: 600, color: "#f8fafc" }}>DISE</Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/directories">Directories</Link>
          <Link href="/upload">Upload</Link>
          <Link href="/regional-context">Regional Context</Link>
          <Link href="/submissions">Submissions</Link>
          <Link href="/backlinks">Backlinks</Link>
        </nav>
        <main style={{ padding: "2rem", maxWidth: 1200, margin: "0 auto" }}>{children}</main>
      </body>
    </html>
  );
}

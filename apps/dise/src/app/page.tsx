import Link from "next/link";

export default function Home() {
  return (
    <div>
      <h1 style={{ marginBottom: "0.5rem" }}>DISE</h1>
      <p style={{ color: "#94a3b8", marginBottom: "2rem" }}>
        Directory Intelligence &amp; Submission Engine — Internal ops tool
      </p>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <Link href="/dashboard" style={{ padding: "0.75rem 1.25rem", background: "#1e293b", borderRadius: 8 }}>
          Dashboard
        </Link>
        <Link href="/directories" style={{ padding: "0.75rem 1.25rem", background: "#1e293b", borderRadius: 8 }}>
          Directories
        </Link>
        <Link href="/regional-context" style={{ padding: "0.75rem 1.25rem", background: "#1e293b", borderRadius: 8 }}>
          Regional Context
        </Link>
        <Link href="/submissions" style={{ padding: "0.75rem 1.25rem", background: "#1e293b", borderRadius: 8 }}>
          Submissions
        </Link>
        <Link href="/backlinks" style={{ padding: "0.75rem 1.25rem", background: "#1e293b", borderRadius: 8 }}>
          Backlinks
        </Link>
      </div>
    </div>
  );
}

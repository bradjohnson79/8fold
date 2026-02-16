export const metadata = {
  title: "8Fold Local API",
  description: "Internal API service (no public homepage)"
};

export default function ApiHomePage() {
  return (
    <main style={{ fontFamily: "ui-sans-serif, system-ui", padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>8Fold Local API</h1>
      <p style={{ marginTop: 10, color: "rgba(17,24,39,0.75)", lineHeight: "22px" }}>
        This is an internal backend service. There is no UI here—use specific routes.
      </p>

      <div style={{ marginTop: 18, padding: 14, border: "1px solid rgba(17,24,39,0.12)", borderRadius: 14 }}>
        <div style={{ fontWeight: 900 }}>Quick checks</div>
        <ul style={{ marginTop: 10, marginBottom: 0, lineHeight: "22px" }}>
          <li>
            Health: <code>/healthz</code>
          </li>
          <li>
            Jobs feed (public): <code>/api/jobs/feed</code>
          </li>
        </ul>
      </div>
    </main>
  );
}


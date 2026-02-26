import { adminApiFetch } from "@/server/adminApiV4";

type Dispute = Record<string, unknown>;

export default async function DisputeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let item: Dispute | null = null;
  let error: string | null = null;
  try {
    const resp = await adminApiFetch<{ dispute: Dispute }>(`/api/admin/v4/disputes/${encodeURIComponent(id)}`);
    item = resp.dispute ?? null;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load dispute";
  }

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Dispute Detail</h1>
      {error ? <div style={{ marginTop: 12, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{error}</div> : null}
      {!error && !item ? <div style={{ marginTop: 12 }}>No dispute found.</div> : null}
      {!error && item ? <pre style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{JSON.stringify(item, null, 2)}</pre> : null}
    </div>
  );
}

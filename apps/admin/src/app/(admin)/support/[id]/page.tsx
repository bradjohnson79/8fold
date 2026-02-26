import { adminApiFetch } from "@/server/adminApiV4";

type Ticket = Record<string, unknown>;

export default async function SupportTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let item: Ticket | null = null;
  let error: string | null = null;
  try {
    const resp = await adminApiFetch<{ ticket: Ticket }>(`/api/admin/v4/support/tickets/${encodeURIComponent(id)}`);
    item = resp.ticket ?? null;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load ticket";
  }

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 950 }}>Support Ticket Detail</h1>
      {error ? <div style={{ marginTop: 12, color: "rgba(254,202,202,0.95)", fontWeight: 900 }}>{error}</div> : null}
      {!error && !item ? <div style={{ marginTop: 12 }}>No ticket found.</div> : null}
      {!error && item ? <pre style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{JSON.stringify(item, null, 2)}</pre> : null}
    </div>
  );
}

import { NotAuthorized } from "@/components/NotAuthorized";

export default async function ForbiddenPage(props: { searchParams?: Promise<{ role?: string }> }) {
  const sp = props.searchParams ? await props.searchParams : undefined;
  const role = sp?.role ? String(sp.role) : null;
  return <NotAuthorized role={role} />;
}


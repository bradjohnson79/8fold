export type AdminUserView = {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  region: string | null;
  status: string;
  createdAt: string;
  phone: string | null;
  country: string | null;
  regionCode: string | null;
  city: string | null;
  suspendedUntil: string | null;
  archivedAt: string | null;
  badges: string[];
  firstName?: string | null;
  lastName?: string | null;
  businessName?: string | null;
  formattedAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export function mapUserRowToAdminUserDTO(row: any): AdminUserView {
  const region = [row.city, row.regionCode ?? row.state, row.country].filter(Boolean).join(", ") || null;
  return {
    id: row.id,
    email: row.email ?? null,
    name: row.name ?? null,
    role: String(row.role ?? ""),
    region,
    status: String(row.status ?? "ACTIVE"),
    createdAt: String(row.createdAt ?? new Date(0).toISOString()),
    phone: row.phone ?? null,
    country: row.country ?? null,
    regionCode: row.regionCode ?? row.state ?? null,
    city: row.city ?? null,
    suspendedUntil: row.suspendedUntil ?? null,
    archivedAt: row.archivedAt ?? null,
    badges: Array.isArray(row.badges) ? row.badges : [],
    firstName: row.firstName ?? null,
    lastName: row.lastName ?? null,
    businessName: row.businessName ?? null,
    formattedAddress: row.formattedAddress ?? null,
    latitude: Number.isFinite(Number(row.latitude)) ? Number(row.latitude) : null,
    longitude: Number.isFinite(Number(row.longitude)) ? Number(row.longitude) : null,
  };
}

export function mapUsersRowsToAdminUserDTO(rows: any[]): AdminUserView[] {
  return rows.map(mapUserRowToAdminUserDTO);
}

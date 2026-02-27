export type AdminBusJobParty = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
};

export type AdminBusJobDTO = {
  id: string;
  title: string;
  rawStatus: string;
  statusRaw: string;
  displayStatus: string;
  isMock: boolean;
  country: string;
  regionCode: string | null;
  city: string | null;
  createdAt: string;
  updatedAt: string;
  amountCents: number;
  paymentState: {
    secured: boolean;
    captured: boolean;
    paid: boolean;
    label: "UNPAID" | "SECURED" | "CAPTURED" | "PAID" | "REFUNDED";
    rawPaymentStatus: string | null;
    rawPayoutStatus: string | null;
  };
  jobPoster: AdminBusJobParty | null;
  router: AdminBusJobParty | null;
  contractor: AdminBusJobParty | null;
  routingStatus: string;
  tradeCategory: string;
  addressFull: string | null;
  archived: boolean;
};

export function mapJobRowToAdminJobDTO(row: any): AdminBusJobDTO {
  const rawStatus = String(row.statusRaw ?? row.rawStatus ?? "");
  return {
    ...row,
    rawStatus,
    statusRaw: rawStatus,
  };
}

export function mapJobsRowsToAdminJobDTO(rows: any[]): AdminBusJobDTO[] {
  return rows.map(mapJobRowToAdminJobDTO);
}

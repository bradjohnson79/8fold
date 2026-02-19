import { NextResponse } from "next/server";
import {
  enforceTier,
  requireAdminIdentityWithTier,
  type AdminIdentityWithTier,
  type AdminTier,
} from "../../_lib/adminTier";

export async function requireFinancialTier(
  req: Request,
  required: AdminTier,
): Promise<NextResponse | AdminIdentityWithTier> {
  const id = await requireAdminIdentityWithTier(req);
  if (id instanceof NextResponse) return id;
  const denied = enforceTier(id, required);
  if (denied) return denied;
  return id;
}


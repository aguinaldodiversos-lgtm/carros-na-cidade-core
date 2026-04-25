import { NextRequest, NextResponse } from "next/server";
import { getPlanById, updatePlanById } from "@/lib/plans/plan-store";

export const dynamic = "force-dynamic";

function isAdminAuthorized(request: NextRequest) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) return true;
  const provided = request.headers.get("x-admin-key");
  return provided === expected;
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const plan = getPlanById(params.id);
  if (!plan) return NextResponse.json({ error: "Plano nao encontrado" }, { status: 404 });
  return NextResponse.json({ plan });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const payload = (await request.json()) as {
    name?: string;
    price?: number;
    ad_limit?: number;
    is_featured_enabled?: boolean;
    has_store_profile?: boolean;
    priority_level?: number;
    is_active?: boolean;
    validity_days?: number | null;
    description?: string;
    benefits?: string[];
    recommended?: boolean;
  };

  const plan = updatePlanById(params.id, payload);
  if (!plan) return NextResponse.json({ error: "Plano nao encontrado" }, { status: 404 });

  return NextResponse.json({ plan });
}

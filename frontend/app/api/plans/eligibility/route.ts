import { NextRequest, NextResponse } from "next/server";
import { fetchPlanEligibility } from "@/lib/account/backend-account";
import { authenticateBffRequest, applyBffCookies } from "@/lib/http/bff-session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateBffRequest(request);
    if (!auth.ok) return auth.response;

    const payload = await fetchPlanEligibility(auth.ctx.session);
    return applyBffCookies(NextResponse.json(payload), auth.ctx);
  } catch (error) {
    console.error("[POST /api/plans/eligibility]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Falha ao verificar elegibilidade." }, { status: 502 });
  }
}

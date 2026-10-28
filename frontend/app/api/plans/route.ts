import { NextRequest, NextResponse } from "next/server";
import { fetchPlans } from "@/lib/account/backend-account";
import { getPlans, type PlanType } from "@/lib/plans/plan-store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type") as PlanType | null;
  const active = request.nextUrl.searchParams.get("active");
  const verified = request.nextUrl.searchParams.get("verified") === "1";
  let plans;
  try {
    plans = await fetchPlans({
      type: type ?? undefined,
      activeOnly: active !== "false",
    });
  } catch {
    if (verified) {
      return NextResponse.json(
        { error: "Catálogo comercial temporariamente indisponível." },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }
    plans = getPlans({
      type: type ?? undefined,
      onlyActive: active !== "false",
    });
  }

  return NextResponse.json({ plans }, { headers: { "Cache-Control": "no-store" } });
}

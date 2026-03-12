import { NextRequest, NextResponse } from "next/server";
import { fetchPlans } from "@/lib/account/backend-account";
import { getPlans, type PlanType } from "@/services/planStore";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type") as PlanType | null;
  const active = request.nextUrl.searchParams.get("active");
  let plans;
  try {
    plans = await fetchPlans({
      type: type ?? undefined,
      activeOnly: active !== "false",
    });
  } catch {
    plans = getPlans({
      type: type ?? undefined,
      onlyActive: active !== "false",
    });
  }

  return NextResponse.json({
    plans,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getPlans, type PlanType } from "@/services/planStore";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type") as PlanType | null;
  const active = request.nextUrl.searchParams.get("active");

  const plans = getPlans({
    type: type ?? undefined,
    onlyActive: active !== "false",
  });

  return NextResponse.json({
    plans,
  });
}

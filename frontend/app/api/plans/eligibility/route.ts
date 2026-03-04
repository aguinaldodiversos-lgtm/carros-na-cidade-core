import { NextRequest, NextResponse } from "next/server";
import { getPlans, validatePublishEligibility } from "@/services/planStore";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { user_id?: string };
  const userId = body.user_id?.trim();

  if (!userId) {
    return NextResponse.json({ error: "user_id e obrigatorio" }, { status: 400 });
  }

  const validation = validatePublishEligibility(userId);
  const suggestedPlans = validation.suggested_plan_type
    ? getPlans({ type: validation.suggested_plan_type, onlyActive: true })
    : [];

  return NextResponse.json({
    ...validation,
    suggested_plans: suggestedPlans,
  });
}

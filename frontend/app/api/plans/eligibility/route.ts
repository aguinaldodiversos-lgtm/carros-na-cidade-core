import { NextRequest, NextResponse } from "next/server";
import { fetchPlanEligibility } from "@/lib/account/backend-account";
import { ensureSessionWithFreshBackendTokens } from "@/lib/session/ensure-backend-session";
import {
  applySessionCookiesToResponse,
  getSessionDataFromRequest,
} from "@/services/sessionService";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = getSessionDataFromRequest(request);
    const ensured = await ensureSessionWithFreshBackendTokens(session);

    if (!ensured.ok || !ensured.session.accessToken) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }

    const payload = await fetchPlanEligibility(ensured.session);
    const res = NextResponse.json(payload);
    if (ensured.persistCookies) {
      applySessionCookiesToResponse(res, ensured.persistCookies);
    }
    return res;
  } catch (error) {
    console.error("[POST /api/plans/eligibility]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Falha ao verificar elegibilidade." }, { status: 502 });
  }
}

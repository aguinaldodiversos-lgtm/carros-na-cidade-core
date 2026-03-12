import { NextRequest, NextResponse } from "next/server";
import { fetchDashboard } from "@/lib/account/backend-account";
import { getSessionDataFromRequest } from "@/services/sessionService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = getSessionDataFromRequest(request);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const payload = await fetchDashboard(session);
  return NextResponse.json(payload);
}

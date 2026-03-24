import { NextRequest, NextResponse } from "next/server";
import { fetchDashboard } from "@/lib/account/backend-account";
import { getSessionDataFromRequest } from "@/services/sessionService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = getSessionDataFromRequest(request);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  try {
    const payload = await fetchDashboard(session);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[api/dashboard/me] fetchDashboard failed:", error);
    return NextResponse.json(
      { error: "Falha ao carregar dashboard" },
      { status: 502 }
    );
  }
}

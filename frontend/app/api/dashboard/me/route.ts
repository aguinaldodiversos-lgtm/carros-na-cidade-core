import { NextRequest, NextResponse } from "next/server";
import { getDashboardPayload } from "@/services/dashboardService";
import { getSessionUserFromRequest } from "@/services/sessionService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = getSessionUserFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const payload = getDashboardPayload(session.id, session.email);
  if (!payload) {
    return NextResponse.json({ error: "Usuario nao encontrado" }, { status: 404 });
  }

  return NextResponse.json(payload);
}

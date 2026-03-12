import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/services/sessionService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = getSessionUserFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  return NextResponse.json({
    user: session,
  });
}

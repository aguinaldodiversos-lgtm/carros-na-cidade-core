import { NextRequest, NextResponse } from "next/server";
import { getAuthUserById } from "@/services/authService";
import { getSessionUserFromRequest } from "@/services/sessionService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = getSessionUserFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const user = getAuthUserById(session.id);
  if (!user) {
    return NextResponse.json({ error: "Usuario nao encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    user,
  });
}

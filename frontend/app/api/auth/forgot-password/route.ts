import { NextRequest, NextResponse } from "next/server";
import { buildBffBackendForwardHeaders } from "@/lib/http/client-ip";
import { requestPasswordReset } from "@/services/authService";

export const dynamic = "force-dynamic";

type Payload = {
  email?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Payload;
  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Email e obrigatorio" }, { status: 400 });
  }

  const ipHeaders = buildBffBackendForwardHeaders(request);
  await requestPasswordReset(email, ipHeaders);
  return NextResponse.json({
    ok: true,
    message: "Se o email existir, enviaremos as instrucoes para recuperacao.",
  });
}

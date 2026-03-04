import { NextRequest, NextResponse } from "next/server";
import { resetPassword } from "@/services/authService";

export const dynamic = "force-dynamic";

type Payload = {
  token?: string;
  password?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Payload;
  const token = body.token?.trim();
  const password = body.password ?? "";

  if (!token || password.length < 6) {
    return NextResponse.json({ error: "Token e nova senha valida sao obrigatorios" }, { status: 400 });
  }

  const updated = await resetPassword(token, password);
  if (!updated) {
    return NextResponse.json({ error: "Nao foi possivel redefinir a senha" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
  });
}

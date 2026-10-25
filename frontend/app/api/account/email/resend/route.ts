import { NextRequest } from "next/server";
import { createBackendProxy } from "@/lib/http/bff-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const proxy = createBackendProxy({
  basePath: "/api/auth/email/resend",
  timeoutMessage: "Tempo esgotado ao enviar confirmação de e-mail.",
});

// Não recebe endereço/usuário: o backend usa a identidade da sessão.
export async function POST(request: NextRequest) {
  return proxy(request, { params: {} });
}

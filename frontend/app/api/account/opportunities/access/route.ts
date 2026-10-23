import { NextRequest } from "next/server";
import { createBackendProxy } from "@/lib/http/bff-proxy";

/** Direitos da conta, sem depender da cidade ou loja selecionada. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const proxy = createBackendProxy({
  basePath: "/api/account/opportunities/summary/access",
  timeoutMessage: "Tempo esgotado ao verificar seu acesso às oportunidades.",
});

export async function GET(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxy(request, context);
}

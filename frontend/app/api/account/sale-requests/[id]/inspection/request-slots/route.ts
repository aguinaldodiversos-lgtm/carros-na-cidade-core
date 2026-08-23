import { NextRequest } from "next/server";
import { createBackendProxy } from "@/lib/http/bff-proxy";

/**
 * "Não consigo nesses horários" (Fase 4.5, §12).
 *
 * Não há corpo a montar — a ação é um SINAL, não uma mensagem. Um campo de texto
 * aqui viraria o canal de conversa que o produto decidiu não ter.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const proxy = createBackendProxy({
  basePath: "/api/account/sale-requests",
  timeoutMessage: "Tempo esgotado ao solicitar novos horários.",
});

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  return proxy(request, {
    params: { path: [context.params.id, "inspection", "request-slots"] },
  });
}

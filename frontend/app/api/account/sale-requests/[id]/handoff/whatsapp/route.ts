import { NextRequest } from "next/server";
import { createBackendProxy } from "@/lib/http/bff-proxy";

/**
 * O contato COMERCIAL da loja cuja oferta foi aceita (Fase 4.7).
 *
 * GET porque é leitura: não muda estado e pode ser repetido. O número NÃO
 * trafega no DTO do detalhe — ele sai por aqui, uma vez, quando a pessoa decide
 * falar com a loja, e o backend registra o acesso no log de domínio.
 *
 * A URL vem PRONTA do servidor. Mandar os dígitos e deixar a tela montar o
 * `wa.me` daria à tela a chance de montá-lo errado — e um `wa.me` errado abre
 * conversa com um estranho.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const proxy = createBackendProxy({
  basePath: "/api/account/sale-requests",
  timeoutMessage: "Tempo esgotado ao buscar o contato da loja.",
});

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  return proxy(request, { params: { path: [context.params.id, "handoff", "whatsapp"] } });
}

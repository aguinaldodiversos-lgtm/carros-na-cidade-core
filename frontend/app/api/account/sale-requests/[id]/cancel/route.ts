import { NextRequest } from "next/server";
import { createBackendProxy } from "@/lib/http/bff-proxy";

/**
 * Cancelamento da solicitação.
 *
 * POST e não DELETE: cancelar é mudança de estado, não remoção. A solicitação
 * permanece no histórico do dono.
 *
 * O corpo não é lido nem montado aqui — o backend não aceita nenhum campo nesta
 * rota. QUEM cancela sai do Bearer; O QUE é cancelado sai do caminho.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const proxy = createBackendProxy({
  basePath: "/api/account/sale-requests",
  timeoutMessage: "Tempo esgotado ao cancelar a solicitação.",
});

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  return proxy(request, { params: { path: [context.params.id, "cancel"] } });
}

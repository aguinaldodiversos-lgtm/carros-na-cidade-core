import { NextRequest } from "next/server";
import { createBackendProxy } from "@/lib/http/bff-proxy";

/**
 * "Não houve acordo com esta loja" (Fase 4.7).
 *
 * Não há corpo para repassar — e a ausência é a regra do produto: nem motivo,
 * nem valor renegociado, nem quem desistiu. O Carros na Cidade não arbitra a
 * negociação, e um campo aqui viraria o depoimento de uma parte sobre a outra.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const proxy = createBackendProxy({
  basePath: "/api/account/sale-requests",
  timeoutMessage: "Tempo esgotado ao registrar a sua resposta.",
});

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  return proxy(request, { params: { path: [context.params.id, "handoff", "no-agreement"] } });
}

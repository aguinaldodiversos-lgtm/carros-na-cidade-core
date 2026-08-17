import { NextRequest } from "next/server";
import { createBackendProxy } from "@/lib/http/bff-proxy";

/**
 * Detalhe de UMA solicitação.
 *
 * `params.id` entra no proxy como segmento de caminho e passa por
 * `isSafePathSegment` — que já recusa `.`, `..`, barra e control-char. Não há
 * validação de formato aqui de propósito: quem decide se "abc" é um id válido é
 * o backend, e ele responde 404 sem confirmar o formato da chave.
 *
 * Não existe PATCH nem PUT: publicou, não edita campo economicamente relevante.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const proxy = createBackendProxy({
  basePath: "/api/account/sale-requests",
  timeoutMessage: "Tempo esgotado ao carregar a solicitação.",
});

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  return proxy(request, { params: { path: [context.params.id] } });
}

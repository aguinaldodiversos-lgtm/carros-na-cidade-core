import { NextRequest } from "next/server";
import { createBackendProxy } from "@/lib/http/bff-proxy";

/**
 * Seleção de uma proposta recebida (Fase 4.4).
 *
 * POST e não PATCH: a escolha é um FATO novo (uma linha na trilha de seleções),
 * não a edição de um campo da solicitação.
 *
 * O corpo é repassado sem ser lido nem reescrito aqui. Ele carrega `offer_id` e
 * mais nada é usado pelo backend: o dono sai do Bearer, e a loja e o valor são
 * derivados da própria oferta DENTRO da transação que trava a solicitação.
 * Validar o formato do id aqui criaria uma segunda autoridade sobre o campo — e
 * a que ficasse para trás recusaria (ou aceitaria) algo que a outra não.
 *
 * `params.id` entra no proxy como segmento de caminho e passa por
 * `isSafePathSegment`, que já recusa `.`, `..`, barra e control-char.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const proxy = createBackendProxy({
  basePath: "/api/account/sale-requests",
  timeoutMessage: "Tempo esgotado ao selecionar a proposta.",
});

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  return proxy(request, { params: { path: [context.params.id, "select-offer"] } });
}

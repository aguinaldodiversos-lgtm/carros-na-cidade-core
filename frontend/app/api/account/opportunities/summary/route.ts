import { NextRequest } from "next/server";
import { createBackendProxy } from "@/lib/http/bff-proxy";

/**
 * BFF do RESUMO do hub de oportunidades do lojista.
 *
 * GET — os quatro números do topo da tela, com a variação de 7 dias de cada um.
 *
 * Rota literal (e não catch-all como os dois feeds vizinhos) porque só existe um
 * caminho: `/api/account/opportunities/summary`. Um `[[...path]]` aqui aceitaria
 * `.../summary/qualquer-coisa` e devolveria o 404 do backend em vez do 404 do
 * Next — mesma tela de erro, causa mais difícil de achar.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESTE PROXY NÃO DECIDE NADA
 * ────────────────────────────────────────────────────────────────────────────
 * Ele não lê nem repassa `city_id` nem identidade: encaminha a query string e o
 * Bearer do usuário. Quem recusa conta CPF (`requireDealerAccount`), resolve a
 * cidade a partir da loja e escopa cada `COUNT(*)` é o backend. Se qualquer uma
 * dessas decisões viesse daqui, bastaria um cliente fora do navegador para
 * contorná-la.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const proxy = createBackendProxy({
  basePath: "/api/account/opportunities/summary",
  timeoutMessage: "Tempo esgotado ao carregar o resumo de oportunidades.",
});

export async function GET(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxy(request, context);
}

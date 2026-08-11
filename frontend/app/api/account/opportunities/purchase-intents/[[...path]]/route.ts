import { NextRequest } from "next/server";
import { createBackendProxy } from "@/lib/http/bff-proxy";

/**
 * BFF das oportunidades do lojista (Compradores ativos).
 *
 * Só GET: nesta fase o lojista lê. Não existe "enviar veículo", não existe
 * resposta à procura — isso é Fase 3, e um verbo de escrita aqui seria uma
 * porta aberta para um endpoint que ainda não foi desenhado.
 *
 * IMPORTANTE: este proxy NÃO decide o que o lojista pode ver. Ele não lê nem
 * repassa `city_id`. Quem resolve a cidade é o backend, a partir do advertiser
 * do usuário autenticado — se a cidade viesse daqui (ou da query string), um
 * lojista veria as procuras de qualquer cidade trocando um parâmetro.
 *
 * A guarda de conta CNPJ (`requireDealerAccount`) também é do backend. O
 * redirect de `/dashboard-loja` no frontend é conveniência de navegação, não
 * autorização.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const proxy = createBackendProxy({
  basePath: "/api/account/opportunities/purchase-intents",
  timeoutMessage: "Tempo esgotado ao carregar as oportunidades.",
});

export async function GET(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxy(request, context);
}

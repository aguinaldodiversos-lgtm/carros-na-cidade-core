import { NextRequest } from "next/server";
import { createBackendProxy } from "@/lib/http/bff-proxy";

/**
 * BFF da área do LOJISTA no Produto 2 — "Veículos para avaliação".
 *
 * GET — feed de veículos disponíveis na cidade da loja, e o detalhe de um deles.
 *
 * Catch-all (e não rotas explícitas como o BFF do dono) porque aqui TODAS as
 * rotas são JSON: o motivo que obrigou o outro arquivo a declarar caminho por
 * caminho — o upload multipart, que `createBackendProxy` corromperia ao ler o
 * corpo com `request.text()` — não existe deste lado. O lojista não envia
 * arquivo nenhum.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESTE PROXY NÃO DECIDE NADA
 * ────────────────────────────────────────────────────────────────────────────
 * Ele não lê nem repassa `city_id`, `advertiser_id` nem identidade: apenas
 * encaminha a query string e o Bearer do usuário. Quem recusa conta CPF
 * (`requireDealerAccount`), resolve a cidade a partir da loja e escopa o feed é
 * o backend. Se qualquer uma dessas decisões viesse daqui, bastaria um cliente
 * fora do navegador para contorná-la.
 *
 * A guarda de navegação do frontend (`requireLojistaDashboardSession`, que
 * redireciona não-CNPJ para /dashboard) é conveniência de UI, não autorização.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const proxy = createBackendProxy({
  basePath: "/api/account/opportunities/sale-requests",
  timeoutMessage: "Tempo esgotado ao carregar os veículos.",
});

export async function GET(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxy(request, context);
}

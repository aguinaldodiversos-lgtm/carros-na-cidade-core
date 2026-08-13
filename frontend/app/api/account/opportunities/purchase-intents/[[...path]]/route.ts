import { NextRequest } from "next/server";
import { createBackendProxy } from "@/lib/http/bff-proxy";

/**
 * BFF das oportunidades do lojista (Compradores ativos + envio de veículos).
 *
 * GET  — lista de oportunidades, detalhe e `/:id/matching-ads` (estoque
 *        compatível do próprio lojista).
 * POST — `/:id/offers`: envia um veículo do estoque ao comprador. É o primeiro
 *        verbo de escrita desta área, adicionado na Fase 3.
 *
 * IMPORTANTE: este proxy NÃO decide o que o lojista pode ver nem o que pode
 * enviar. Ele não lê nem repassa `city_id`, `ad_id` ou identidade — apenas
 * encaminha o corpo com o Bearer do usuário. Quem resolve a cidade, prova a
 * posse do anúncio, revalida a compatibilidade e aplica o limite de 3 é o
 * backend. Se qualquer uma dessas decisões viesse daqui, bastaria um cliente
 * fora do navegador para contorná-la.
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

export async function POST(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxy(request, context);
}

import { NextRequest } from "next/server";
import { createBackendProxy } from "@/lib/http/bff-proxy";

/**
 * BFF das procuras do comprador logado.
 *
 * Encaminha para `/api/account/purchase-intents/*` com o Bearer do próprio
 * usuário. A posse de cada procura é garantida no backend
 * (`WHERE buyer_user_id = $n`), então este proxy nunca precisa saber de quem é
 * o quê — e por isso não filtra nem reescreve nada do payload.
 *
 * Catch-all OPCIONAL (`[[...path]]`): a rota base sem segmento é a listagem,
 * um endpoint real. Com `[...path]` obrigatório ela não casaria.
 *
 * GET, POST e PATCH — os três verbos que o backend expõe. Não existe DELETE:
 * encerrar procura é PATCH `/:id/close`, porque a linha permanece no histórico.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const proxy = createBackendProxy({
  basePath: "/api/account/purchase-intents",
  timeoutMessage: "Tempo esgotado ao carregar suas procuras.",
});

export async function GET(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxy(request, context);
}

export async function POST(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxy(request, context);
}

export async function PATCH(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxy(request, context);
}

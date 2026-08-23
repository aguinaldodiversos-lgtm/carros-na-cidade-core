import { NextRequest } from "next/server";
import { createBackendProxy } from "@/lib/http/bff-proxy";

/**
 * A decisão do proprietário sobre a proposta final (Fase 4.6).
 *
 * O corpo é repassado sem ser lido nem reescrito: ele carrega `decision`, e o
 * VALOR não viaja — o backend o copia da proposta final persistida, dentro da
 * transação, com a FK composta da migration 059 conferindo a cópia no banco.
 *
 * Aceitar o valor do cliente permitiria "aceitar R$ 60.000" e gravar outro
 * número, que é exatamente o que o desenho desta fase torna impossível.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const proxy = createBackendProxy({
  basePath: "/api/account/sale-requests",
  timeoutMessage: "Tempo esgotado ao registrar a sua decisão.",
});

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  return proxy(request, { params: { path: [context.params.id, "final-offer-decision"] } });
}

import { NextRequest } from "next/server";
import { createBackendProxy } from "@/lib/http/bff-proxy";

/**
 * Confirmação do horário da avaliação presencial (Fase 4.5).
 *
 * O corpo é repassado sem ser lido nem reescrito: ele carrega `slot_id`, e o
 * INSTANTE não viaja — o backend o copia da própria linha do horário, dentro da
 * transação. Aceitar o instante do cliente permitiria confirmar um horário e
 * gravar outro.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const proxy = createBackendProxy({
  basePath: "/api/account/sale-requests",
  timeoutMessage: "Tempo esgotado ao confirmar o horário.",
});

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  return proxy(request, { params: { path: [context.params.id, "inspection", "confirm"] } });
}

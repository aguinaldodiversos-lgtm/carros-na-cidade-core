import { NextRequest } from "next/server";
import { createBackendProxy } from "@/lib/http/bff-proxy";

/**
 * "Receber novas ofertas" — abre uma rodada nova (Fase 4.7).
 *
 * O corpo carrega apenas `minimum_accepted_price`. O NÚMERO da rodada não
 * viaja: ele é derivado pelo backend do ponteiro travado, e aceitá-lo do cliente
 * permitiria pular para a rodada 9 ou reescrever a rodada 1.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const proxy = createBackendProxy({
  basePath: "/api/account/sale-requests",
  timeoutMessage: "Tempo esgotado ao abrir a nova rodada.",
});

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  return proxy(request, { params: { path: [context.params.id, "rounds"] } });
}

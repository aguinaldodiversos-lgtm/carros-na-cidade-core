import { NextRequest } from "next/server";
import { createBackendProxy } from "@/lib/http/bff-proxy";

/**
 * BFF de "Venda seu carro para lojas" — listagem e publicação.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ROTAS EXPLÍCITAS, E NÃO UM CATCH-ALL `[[...path]]`
 * ────────────────────────────────────────────────────────────────────────────
 * O proxy de procuras usa catch-all porque todas as suas rotas são JSON. Aqui
 * existe uma rota MULTIPART (`/photos`), e `createBackendProxy` lê o corpo com
 * `request.text()` — o que corromperia o binário das fotos.
 *
 * Com rotas explícitas, cada caminho declara o que é: as três JSON reusam o
 * proxy, e o upload tem handler próprio. O leitor vê a superfície inteira sem
 * precisar deduzir o que o catch-all captura.
 *
 * IMPORTANTE: este proxy NÃO decide nada. Não lê nem repassa `owner_user_id`,
 * `status` ou valor FIPE — apenas encaminha o corpo com o Bearer do usuário.
 * Quem recusa conta CNPJ, prova a posse das fotos, resolve a FIPE e aplica o
 * teto de 3 é o backend. Se qualquer uma dessas decisões viesse daqui, bastaria
 * um cliente fora do navegador para contorná-la.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const proxy = createBackendProxy({
  basePath: "/api/account/sale-requests",
  timeoutMessage: "Tempo esgotado ao carregar suas solicitações.",
});

export async function GET(request: NextRequest) {
  return proxy(request, { params: {} });
}

export async function POST(request: NextRequest) {
  return proxy(request, { params: {} });
}

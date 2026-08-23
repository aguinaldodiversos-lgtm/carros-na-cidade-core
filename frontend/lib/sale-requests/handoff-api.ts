/**
 * As três chamadas do HANDOFF (Fase 4.7).
 *
 * Arquivo próprio, e não mais funções em `api.ts`, porque as três compartilham
 * um contrato que o resto do módulo não tem: nenhuma delas envia valor, loja ou
 * identidade — o servidor deriva tudo da sessão e do estado travado.
 */
import { SaleRequestError } from "./api";
import type { SaleRequestRound } from "./handoff";

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (T & { success?: boolean; message?: string; details?: { code?: string }; code?: string })
    | null;

  if (!response.ok || payload?.success === false) {
    const code = payload?.details?.code ?? payload?.code ?? null;
    const message =
      payload?.message ||
      (response.status === 401
        ? "Sua sessão expirou. Entre novamente."
        : "Não foi possível concluir a operação.");
    throw new SaleRequestError(message, response.status, code);
  }

  return payload as T;
}

/**
 * O link de WhatsApp da loja cuja oferta foi aceita.
 *
 * Resolvido no SERVIDOR e devolvido pronto. A tela nunca monta `wa.me` — o
 * número não trafega no DTO do detalhe, sai UMA vez, quando a pessoa decide
 * falar com a loja, e o acesso fica registrado no log de domínio.
 */
export async function fetchHandoffWhatsapp(id: string | number) {
  const response = await fetch(`/api/account/sale-requests/${id}/handoff/whatsapp`, {
    cache: "no-store",
  });
  return readJson<{ url: string }>(response);
}

/**
 * "Não houve acordo com esta loja".
 *
 * SEM corpo, e a ausência é a regra: nem motivo, nem valor, nem quem desistiu.
 * O Carros na Cidade não arbitra a negociação.
 */
export async function reportNoAgreement(id: string | number) {
  const response = await fetch(`/api/account/sale-requests/${id}/handoff/no-agreement`, {
    method: "POST",
  });
  return readJson<{ changed: boolean }>(response);
}

/**
 * "Receber novas ofertas" — abre uma rodada nova.
 *
 * Envia APENAS o piso novo. O número da rodada é derivado pelo servidor do
 * ponteiro travado; aceitá-lo do cliente permitiria pular para a rodada 9 ou
 * reescrever a rodada 1.
 */
export async function openNewRound(id: string | number, minimumAcceptedPrice: string) {
  const response = await fetch(`/api/account/sale-requests/${id}/rounds`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ minimum_accepted_price: minimumAcceptedPrice }),
  });
  return readJson<{ round: SaleRequestRound; changed: boolean }>(response);
}

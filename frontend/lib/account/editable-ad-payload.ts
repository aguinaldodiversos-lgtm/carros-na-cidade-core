import type { UpdateOwnedAdPayload } from "@/lib/account/backend-account";

/**
 * Whitelist da edição de anúncio pelo lojista (BFF `PUT /api/ads/[id]`).
 *
 * Campos estruturais (brand/model/year/city/state) e `status`/`advertiser_id`
 * NÃO são repassados — o backend já os recusa, mas filtramos aqui para o
 * contrato ficar explícito e evitar payload enganoso.
 *
 * ⚠️ ESTA WHITELIST É SILENCIOSA. Campo que o formulário envia e ela não lista
 * é descartado SEM ERRO: o lojista salva, vê "sucesso", e nada muda no banco.
 *
 * Foi exatamente assim que `transmission` e `body_type` ficaram congelados
 * durante toda a Fase B (corrigido em 2026-07-27). O `EditAdForm` mandava os
 * dois e o backend os aceitava em `UPDATE_FIELDS`; só esta lista no meio não
 * repassava. Resultado em produção: 14 dos 19 anúncios ativos com coluna e
 * opcional divergentes — a página exibia um câmbio (derivado do opcional
 * `cambio_*`) e o filtro classificava por outro (a coluna `transmission`).
 * Mesmo anúncio, dois veredictos.
 *
 * Extraída do `route.ts` para ser testável: route handlers do Next validam os
 * exports do módulo, então exportar um helper de lá é arriscado.
 *
 * AO ADICIONAR CAMPO AO FORMULÁRIO, ADICIONE AQUI TAMBÉM.
 */
export function pickEditablePayload(raw: unknown): UpdateOwnedAdPayload {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const payload: UpdateOwnedAdPayload = {};

  if (typeof body.title === "string") payload.title = body.title;
  if (typeof body.description === "string" || body.description === null) {
    payload.description = body.description as string | null;
  }
  if (body.price !== undefined && body.price !== null && body.price !== "") {
    payload.price = Number(body.price);
  }
  if (body.mileage !== undefined && body.mileage !== null && body.mileage !== "") {
    payload.mileage = Number(body.mileage);
  }
  // Opcionais: aceita array de keys ou objeto agrupado; o backend valida as
  // keys contra o catálogo. Presença (mesmo lista vazia) permite LIMPAR.
  if (Array.isArray(body.vehicle_options) || isPlainObject(body.vehicle_options)) {
    payload.vehicle_options = body.vehicle_options as UpdateOwnedAdPayload["vehicle_options"];
  }

  // Câmbio e carroceria: rótulo ("Automático", "Hatch") ou null para limpar.
  // O backend normaliza label → slug em
  // `normalizeAdVehicleFieldsForPersistence`.
  //
  // Teste por `in`, não por truthiness: ausente significa "não mexer", mas ""
  // e null significam "limpar" e precisam chegar ao backend. Colapsar os dois
  // casos deixaria o lojista sem como desfazer um valor errado.
  //
  // Sincronia com o opcional `cambio_*` é garantida por construção no
  // formulário: o seletor de câmbio chama `syncCambioOptionKeys`, e as chaves
  // `cambio_*` ficam escondidas do seletor manual de opcionais
  // (`hiddenKeys={CAMBIO_OPTION_KEYS}` no EditAdForm e no wizard). Não existe
  // caminho de UI que altere o opcional sem passar pelo seletor de câmbio.
  if ("transmission" in body) {
    payload.transmission = toNullableLabel(body.transmission);
  }
  if ("body_type" in body) {
    payload.body_type = toNullableLabel(body.body_type);
  }

  return payload;
}

/** Rótulo não-vazio ou `null` (limpar). */
function toNullableLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

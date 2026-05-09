/**
 * Mapper único para "tipo de anunciante" no portal público.
 *
 * Fonte de verdade canônica:
 *   - Backend devolve `seller_kind` ("dealer" | "private") já computado em
 *     `src/modules/ads/ads.public-trust.js#deriveSellerKind`. Esse é o
 *     único campo que o frontend deve consumir.
 *
 * Fallback (apenas para payloads antigos que ainda não passaram pelo trust
 * pass — possível em cache stale durante deploy de transição):
 *   1. dealership_id válido → "dealer"
 *   2. account_type === 'CNPJ' → "dealer"
 *   3. caso contrário → "private"
 *
 * NÃO USAMOS heurística por nome (`dealership_name`, `seller_name`,
 * `dealer_name`) — frontend caía em armadilhas como "ittmotors"
 * exibido como particular ou particular com selo de loja. O nome só
 * informa o LABEL ("AutoCar Veículos"), não o KIND.
 *
 * Regra acordada (rodada de credibilidade):
 *   - dealer  → exibir como "Loja" / "Revenda" + badge correspondente
 *   - private → exibir como "Anunciante particular"
 */

export type SellerKind = "dealer" | "private";

type SellerKindInput = {
  /** Sempre populado em payloads novos do backend trust pass. */
  seller_kind?: string | null;
  /** Compat com frontend legado (mesma string). */
  seller_type?: string | null;
  /** Fallback 1: id da advertisers row (loja registrada). */
  dealership_id?: string | number | null;
  /** Fallback 2: 'CPF' | 'CNPJ' (do users.document_type). */
  account_type?: string | null;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function resolveSellerKind(item: SellerKindInput | null | undefined): SellerKind {
  if (!item) return "private";

  // 1. Backend já mandou o veredito? Confiamos.
  const kindFromBackend = asString(item.seller_kind) || asString(item.seller_type);
  if (kindFromBackend === "dealer" || kindFromBackend === "dealership") return "dealer";
  if (kindFromBackend === "private" || kindFromBackend === "particular") return "private";

  // 2. Fallback: dealership_id existe e é válido → loja registrada.
  const dealershipIdRaw = item.dealership_id;
  if (dealershipIdRaw != null && dealershipIdRaw !== "") {
    const id = typeof dealershipIdRaw === "number" ? dealershipIdRaw : Number(dealershipIdRaw);
    if (Number.isFinite(id) && id > 0) return "dealer";
  }

  // 3. Fallback: CNPJ sem advertiser ainda — tratar como loja para
  //    evitar que CNPJ apareça como particular.
  const accountType = String(item.account_type || "")
    .trim()
    .toUpperCase();
  if (accountType === "CNPJ") return "dealer";

  return "private";
}

/**
 * Label visual derivado do kind. Não exibir "company_name"/"seller_name"
 * como sinal de tipo — esses campos são só o NOME do anunciante.
 */
export function sellerKindLabel(kind: SellerKind): string {
  return kind === "dealer" ? "Loja" : "Anunciante particular";
}

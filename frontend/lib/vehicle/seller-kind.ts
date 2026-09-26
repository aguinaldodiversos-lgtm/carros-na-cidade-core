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
 *   1. account_type === 'CNPJ' → "dealer"; 'CPF' → "private"
 *   2. sem documento: dealership_name (company_name) preenchido → "dealer"
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
  /** Fallback 1: 'CPF' | 'CNPJ' (do users.document_type). */
  account_type?: string | null;
  /** Fallback 2: `advertisers.company_name` — só conta de loja tem. */
  dealership_name?: string | null;
  /**
   * Presente no payload por compatibilidade, mas NÃO é sinal de tipo: é
   * `advertisers.id`, que todo anúncio possui, inclusive os de PF.
   */
  dealership_id?: string | number | null;
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

  // 2. Fallback: documento da conta. `dealership_id` NÃO serve — é
  //    `advertisers.id`, e todo anúncio tem um, inclusive os de pessoa
  //    física, então ele classificava qualquer anúncio como loja (mesmo
  //    defeito que havia no backend, corrigido em `deriveSellerKind`).
  const accountType = String(item.account_type || "")
    .trim()
    .toUpperCase();

  // Sem CNPJ, é particular — inclusive quando o documento não veio. Padrão
  // seguro: errar para menos não promete uma loja que não existe. O
  // desempate por `company_name` foi removido junto com o do backend (ver
  // `deriveSellerKind`): nenhuma conta sem documento tem anúncio.
  return accountType === "CNPJ" ? "dealer" : "private";
}

/**
 * Label visual derivado do kind. Não exibir "company_name"/"seller_name"
 * como sinal de tipo — esses campos são só o NOME do anunciante.
 */
export function sellerKindLabel(kind: SellerKind): string {
  return kind === "dealer" ? "Loja" : "Anunciante particular";
}

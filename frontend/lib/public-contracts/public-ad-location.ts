// frontend/lib/public-contracts/public-ad-location.ts
//
// TRAVA DE SEGURANÇA (Onda 2 Fase 2a): ponto ÚNICO que decide o nível de
// granularidade da localização pública de um anúncio.
//
// Regra travada de produto: BAIRRO só para LOJA (endereço comercial público).
// PESSOA FÍSICA nunca abaixo de CIDADE — em nenhuma página, schema ou meta
// (risco de segurança: golpista indo à residência). Aqui é impossível-por-
// construção: `bairro` só é retornado quando `sellerType === "dealer"` E há
// bairro comercial; para qualquer outro tipo, `bairro` é SEMPRE null.
//
// Views/JSON-LD/meta devem ler SÓ o retorno desta função — nunca campos crus
// de endereço do anúncio/anunciante.

export type PublicSellerType = "dealer" | "private" | string | null | undefined;

export interface PublicAdLocationInput {
  city: string | null | undefined;
  citySlug?: string | null;
  sellerType?: PublicSellerType;
  /** Bairro COMERCIAL da loja (ex.: do CNPJ). Ignorado se não for dealer. */
  neighborhood?: string | null;
}

export interface PublicAdLocation {
  city: string;
  citySlug: string | null;
  /** Preenchido SOMENTE para loja com bairro comercial. PF → sempre null. */
  bairro: string | null;
}

/** `true` apenas para o tipo exato "dealer" (case-insensitive). Qualquer outro
 *  valor (private, pf, undefined, null, "") → false. Fail-safe restritivo. */
function isDealer(sellerType: PublicSellerType): boolean {
  return String(sellerType ?? "").trim().toLowerCase() === "dealer";
}

export function buildPublicAdLocation(input: PublicAdLocationInput): PublicAdLocation {
  const city = String(input.city ?? "").trim();
  const citySlug = input.citySlug ? String(input.citySlug).trim() : null;

  let bairro: string | null = null;
  if (isDealer(input.sellerType)) {
    const n = String(input.neighborhood ?? "").trim();
    if (n) bairro = n;
  }

  return { city, citySlug, bairro };
}

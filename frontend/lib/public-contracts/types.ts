/**
 * Contratos públicos consolidados para a vitrine — briefing P2 2026-05-25.
 *
 * Cada Page/Component PÚBLICO deve consumir o tipo `PublicAd` (e seus
 * derivados) em vez de re-implementar normalização ad-hoc. Isso evita:
 *   - card com R$ 0 (price sintético)
 *   - card sem href válido (slug ausente)
 *   - cidade hardcoded "São Paulo"/"SP"
 *   - leak de campos técnicos para o cliente
 *
 * Fonte única deste contrato vive em `frontend/lib/public-contracts/`.
 * Componentes existentes (AdCard, CatalogVehicleCard, HomeCarousels)
 * continuam aceitando `BaseAdData` por compatibilidade; o adapter
 * `normalizePublicAd` produz um payload compatível.
 */

/**
 * Subset essencial de um anúncio para uso em superfícies públicas.
 * Cards, hrefs, badges e empty states leem apenas estes campos.
 *
 * IMPORTANTE: todo valor "vazio" usa `null` (não `undefined` nem `""`)
 * para que helpers downstream tenham UM check só. `price: 0` é
 * tratado como "sem preço informado" — nunca renderizado como "R$ 0".
 */
export interface PublicAd {
  /** ID numérico do backend. Necessário para deduplicação e analytics. */
  id: number;
  /** Slug canônico para hrefs. Quando null, o card NÃO deve ser exibido. */
  slug: string | null;
  /** Título humano para card/SEO. Pode ser composto de brand+model+version. */
  title: string;
  /** Marca em title case. */
  brand: string | null;
  /** Modelo em title case. */
  model: string | null;
  /** Versão/spec do veículo (motor, câmbio etc). Pode ser longo. */
  version: string | null;
  /** Ano do veículo (4 dígitos) ou null. */
  year: number | null;
  /** Quilometragem ou null. */
  mileage: number | null;
  /**
   * Preço em BRL como NUMBER. `null` quando ausente/zero — NUNCA renderizar
   * como "R$ 0". Use `formatPricePublic(price)` que devolve "Sob consulta".
   */
  price: number | null;
  /** Nome da cidade (não slug). `null` quando backend não informou. */
  city: string | null;
  /** UF (2 letras) ou null. */
  state: string | null;
  /** Slug da cidade no formato `nome-uf` (sem accents). */
  citySlug: string | null;
  /** URL da imagem de capa. Pode ser placeholder seguro. */
  image: string | null;
  /** Sinais usados pelos badges públicos (Destaque, Oportunidade etc). */
  badges: PublicAdBadgeSignals;
}

/**
 * Subset dos sinais que `publicBadgeLabels()` consome para decidir os
 * selos visíveis. Espelha o `AdBadgeSignals` canônico de
 * `lib/ads/ad-badges.ts` — duplicação intencional para que o contrato
 * público fique independente do mapeamento.
 */
export interface PublicAdBadgeSignals {
  priorityTier: 1 | 2 | 3 | 4 | null;
  highlightUntil: string | null;
  belowFipe: boolean;
  opportunity: boolean;
  sellerKind: "dealer" | "private" | null;
  reviewedAfterBelowFipe: boolean;
}

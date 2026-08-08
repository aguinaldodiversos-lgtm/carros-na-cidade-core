import type { CitySeoOverview } from "@/lib/seo/city-seo-overview";

/**
 * Texto territorial DATA-DRIVEN (Fase 3, Etapa 8).
 *
 * A frase que este módulo NÃO produz:
 *
 *   "Atibaia é uma ótima cidade para comprar carros..."
 *
 * — porque ela é verdadeira para 5.570 municípios e portanto não descreve
 * nenhum. Cada sentença aqui é derivada de um número do inventário ativo; se o
 * número não existe (ou não passa no portão de qualidade estatística), a
 * sentença simplesmente não é escrita. Nada é preenchido com genérico.
 *
 * Regras de redação:
 *   • uma sentença = um fato verificável;
 *   • nenhum número escrito à mão no componente;
 *   • sem repetir a keyword: o nome da cidade aparece no máximo uma vez por
 *     parágrafo, e a variação vem dos dados (marcas, câmbio, faixa), não de
 *     sinônimos empilhados.
 */

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

export function formatBrl(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? BRL.format(value) : "";
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** "A, B e C" — sem vírgula serial, como se escreve em português. */
export function listToSentence(items: string[]): string {
  const clean = items.filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  return `${clean.slice(0, -1).join(", ")} e ${clean[clean.length - 1]}`;
}

/**
 * Parágrafos do módulo "mercado de carros em [cidade]".
 * Devolve `[]` quando não há inventário — a seção inteira some.
 */
export function buildMarketParagraphs(overview: CitySeoOverview): string[] {
  const { city, inventory, priceStats, brands, models } = overview;
  const { activeAds, activeDealers, belowFipeCount, automaticCount } = inventory;

  if (activeAds <= 0) return [];

  const paragraphs: string[] = [];

  // 1. Volume + composição da oferta.
  const brandCount = brands.length;
  const first = [
    `Há ${activeAds} ${plural(activeAds, "veículo anunciado", "veículos anunciados")} em ${city.name}`,
    brandCount > 0
      ? `, de ${brandCount} ${plural(brandCount, "marca", "marcas")} ${plural(brandCount, "diferente", "diferentes")}`
      : "",
    activeDealers > 1
      ? `, publicados por ${activeDealers} anunciantes`
      : activeDealers === 1
        ? `, publicados por 1 anunciante`
        : "",
    ".",
  ].join("");
  paragraphs.push(first);

  // 2. Preço — só quando a amostra sustenta (ver PRICE_STATS_MIN_SAMPLE).
  if (priceStats.publishable && priceStats.minPrice != null && priceStats.maxPrice != null) {
    const median = priceStats.medianPrice;
    paragraphs.push(
      `Os preços vão de ${formatBrl(priceStats.minPrice)} a ${formatBrl(priceStats.maxPrice)}` +
        (median != null ? `, com mediana de ${formatBrl(median)}` : "") +
        `.`
    );
  }

  // 3. Recortes que o comprador realmente filtra.
  const cuts: string[] = [];
  if (automaticCount > 0) {
    cuts.push(
      `${automaticCount} ${plural(automaticCount, "é automático", "são automáticos")}`
    );
  }
  if (belowFipeCount > 0) {
    cuts.push(
      `${belowFipeCount} ${plural(belowFipeCount, "está anunciado", "estão anunciados")} abaixo da tabela FIPE`
    );
  }
  if (cuts.length > 0) {
    paragraphs.push(`Do total, ${listToSentence(cuts)}.`);
  }

  // 4. Marcas com mais oferta — entidades, não adjetivos.
  const topBrands = brands.slice(0, 3).map((b) => b.label);
  if (topBrands.length > 0) {
    paragraphs.push(`As marcas com mais ofertas são ${listToSentence(topBrands)}.`);
  }

  // 5. Modelo comercial mais anunciado — só quando o recorte tem volume.
  const topModel = models.find((m) => m.qualified);
  if (topModel) {
    paragraphs.push(
      `O modelo mais anunciado é o ${topModel.brandLabel} ${topModel.label}, com ${topModel.activeAds} ofertas.`
    );
  }

  return paragraphs;
}

/**
 * Linha de proveniência do dado. Existe para que o número exibido não pareça
 * uma afirmação atemporal de mercado — é um retrato do inventário do portal
 * naquele instante.
 */
export function buildInventoryTimestampLabel(overview: CitySeoOverview): string | null {
  const iso = overview.inventory.updatedAt;
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
    .format(date);
}

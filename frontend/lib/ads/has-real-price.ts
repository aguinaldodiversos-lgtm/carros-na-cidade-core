/**
 * Filtro de price > 0 para vitrines públicas.
 *
 * Regra explícita do produto: nenhum card público pode aparecer com R$ 0
 * — passa imagem de site inacabado e quebra a confiança do comprador.
 * Anúncios com preço ausente, vazio ou zero não devem ser renderizados em
 * carrosséis/grades como "destaque" ou "oportunidade abaixo da FIPE".
 *
 * O parser aceita números, strings BR ("R$ 65.000"), strings cruas
 * ("65000.00") e devolve `false` para qualquer entrada que não derive em
 * um número finito > 0. Em hot-paths usamos via `array.filter(hasRealPrice)`.
 */
export function hasRealPrice(item: { price?: number | string | null }): boolean {
  const raw = item?.price;
  if (raw == null || raw === "") return false;

  const numeric =
    typeof raw === "number"
      ? raw
      : Number(
          String(raw)
            .replace(/[^\d,.-]/g, "")
            .replace(/\.(?=\d{3}(\D|$))/g, "")
            .replace(",", ".")
        );

  return Number.isFinite(numeric) && numeric > 0;
}

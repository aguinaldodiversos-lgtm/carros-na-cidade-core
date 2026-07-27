/**
 * Tag de cache do detalhe de anúncio — fonte ÚNICA para quem LÊ e quem
 * INVALIDA.
 *
 * Por que um helper para uma template string: `revalidateTag` é silencioso.
 * Se o lado da escrita montar a tag de um jeito e o da leitura de outro, nada
 * acontece e nada avisa — o cache continua velho e o bug parece "às vezes
 * funciona". Um único lugar elimina a divergência.
 *
 * PROBLEMA DE IDENTIDADE: a página pública lê por SLUG
 * (`/veiculo/[slug]` → `fetchAdDetail(slug)`), mas o painel escreve por ID
 * (`PUT /api/ads/[id]`). São chaves diferentes para a mesma entidade, então a
 * escrita invalida AS DUAS tags — id e slug — senão a página por slug
 * continuaria servindo o payload antigo.
 */
export function adDetailTag(identifier: string | number | null | undefined): string | null {
  const key = String(identifier ?? "")
    .trim()
    .toLowerCase();
  return key ? `ad-detail:${key}` : null;
}

/**
 * Todas as tags que identificam um anúncio. Usar na INVALIDAÇÃO, que precisa
 * cobrir qualquer chave por onde a leitura possa ter cacheado.
 */
export function adDetailTagsFor(input: {
  id?: string | number | null;
  slug?: string | null;
}): string[] {
  return [adDetailTag(input.id), adDetailTag(input.slug)].filter(
    (tag): tag is string => tag !== null
  );
}

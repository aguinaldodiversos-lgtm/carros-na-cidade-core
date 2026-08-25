/**
 * Tag canônica do cache de dados públicos de ANÚNCIOS (Fase 4.10A).
 *
 * POR QUE UMA TAG SÓ
 * ------------------
 * Um anúncio bloqueado precisa sumir de todas as vitrines de uma vez. Se cada
 * superfície tivesse a própria tag, invalidar seria uma lista que alguém teria
 * de lembrar de manter completa — e a primeira esquecida seguiria servindo o
 * anúncio até o TTL. Uma tag compartilhada torna a invalidação total por
 * construção: quem adicionar uma vitrine nova só precisa marcá-la.
 *
 * O custo é invalidar um pouco mais do que o estritamente necessário. É o
 * custo certo: moderação é rara (não é um evento por segundo), e o preço de
 * revalidar a mais é uma leitura extra no backend, enquanto o preço de
 * revalidar a menos é um anúncio bloqueado continuar público.
 *
 * NÃO cobre o detalhe `/veiculo/[slug]` — aquele já cai em 404 na hora, pelo
 * gate do middleware, sem depender de cache nenhum.
 *
 * A string precisa bater com `ALLOWED_TAGS` em `app/api/revalidate/route.ts`
 * e com `PUBLIC_ADS_CACHE_TAG` no backend
 * (`src/shared/cache/next-revalidate.js`). Há teste de sincronia travando os
 * três.
 */
export const PUBLIC_ADS_CACHE_TAG = "public-ads";

/**
 * Aplica a tag preservando as que a superfície já usa.
 *
 * A home tem `public-home` / `public-home:${uf}` e o conjunto de cidades tem
 * `public-city-set` — sobrescrever essas tags quebraria as invalidações que já
 * existiam (Fase 4.1). Esta função só acrescenta.
 */
export function withPublicAdsTag(tags: readonly string[] = []): string[] {
  return tags.includes(PUBLIC_ADS_CACHE_TAG) ? [...tags] : [...tags, PUBLIC_ADS_CACHE_TAG];
}

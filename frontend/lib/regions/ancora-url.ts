/**
 * Helpers puros para construir URLs da Página Regional.
 *
 * URL CANÔNICA (Fase 5, briefing 2026-05-18):
 *   `/carros-usados/regiao/{citySlug}`
 *   onde `citySlug` é o slug canônico da cidade-base no formato `nome-uf`
 *   (regex `^[a-z0-9-]+-[a-z]{2}$`).
 *
 *   Exemplos:
 *     atibaia-sp          → /carros-usados/regiao/atibaia-sp
 *     campinas-sp         → /carros-usados/regiao/campinas-sp
 *     belo-horizonte-mg   → /carros-usados/regiao/belo-horizonte-mg
 *
 * URL LEGADA (mantida só como redirect 301 pelo middleware):
 *   `/{uf}/regiao/{ancoraPart}`
 *   ex.: /sp/regiao/atibaia → 301 → /carros-usados/regiao/atibaia-sp
 *
 *   Esse formato existiu brevemente na Fase 4 (2026-05-17) e foi
 *   revertido na Fase 5 para alinhar com o padrão de `/carros-em/[slug]`,
 *   reduzir partições de URL e usar diretamente o slug canônico do DB.
 *
 * Não existe mais "região com slug regional separado". A região USA o
 * slug da cidade-base como identificador.
 */

/**
 * Converte um slug canônico de cidade-base para o href da Página Regional.
 *
 * Hoje: simples concatenação `/carros-usados/regiao/${slug}`. Mantido
 * como função para preservar um ponto único de mudança se o formato
 * canônico evoluir.
 *
 * Slug é encodeURIComponent-safe — o caller pode passar slugs com chars
 * não-ASCII e o encoder lida (defesa; slugs canônicos não têm acentos).
 *
 * @param slug citySlug canônico (`nome-uf`, ex.: `campinas-sp`).
 */
export function slugToRegionHref(slug: string): string {
  const clean = String(slug || "")
    .trim()
    .toLowerCase();
  if (!clean) return "/";
  return `/carros-usados/regiao/${encodeURIComponent(clean)}`;
}

/**
 * Alias retrocompatível para callers que ainda usam o nome antigo.
 *
 * @deprecated Use `slugToRegionHref`. Mantido para evitar breakage em
 * rollout — será removido em sweep posterior quando todos os consumers
 * estiverem migrados.
 */
export const slugToAncoraHref = slugToRegionHref;

/**
 * Constrói o href da Página Regional a partir de partes separadas
 * `(uf, ancoraPart)`, reconstruindo o slug canônico `${ancoraPart}-${uf}`.
 *
 * Útil para handlers que recebem `(uf, ancoraPart)` do path antigo
 * (/sp/regiao/atibaia) e precisam redirecionar para a URL canônica.
 *
 * @param uf 2 letras (insensible a case)
 * @param ancora parte de ancora sem sufixo UF
 */
export function ancoraHrefFromParts(uf: string, ancora: string): string {
  const ufNorm = String(uf || "")
    .trim()
    .toLowerCase()
    .slice(0, 2);
  const ancoraNorm = String(ancora || "")
    .trim()
    .toLowerCase();
  if (!ufNorm || !ancoraNorm) return "/";
  return slugToRegionHref(`${ancoraNorm}-${ufNorm}`);
}

/**
 * Reconstrói o slug canônico `nome-uf` a partir de partes separadas.
 * Usado pelo middleware para mapear o legado `/uf/regiao/ancora`
 * para a URL canônica.
 */
export function slugFromAncoraParts(uf: string, ancora: string): string {
  const ufNorm = String(uf || "")
    .trim()
    .toLowerCase()
    .slice(0, 2);
  const ancoraNorm = String(ancora || "")
    .trim()
    .toLowerCase();
  if (!ufNorm || !ancoraNorm) return "";
  return `${ancoraNorm}-${ufNorm}`;
}

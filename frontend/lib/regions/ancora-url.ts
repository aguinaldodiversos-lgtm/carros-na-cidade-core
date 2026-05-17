/**
 * Helpers puros para construir/converter URLs da Página Regional.
 *
 * Formato antigo: `/carros-usados/regiao/atibaia-sp`  (slug completo)
 * Formato novo:   `/sp/regiao/atibaia`                (uf/ancora separados)
 *
 * Regra de extração: o slug canônico é `{ancora}-{uf}` onde uf tem
 * exatamente 2 letras minúsculas. `atibaia-sp` → uf=sp, ancora=atibaia.
 * Slugs compostos funcionam: `belo-horizonte-mg` → uf=mg, ancora=belo-horizonte.
 */

const SLUG_UF_RE = /^(.+)-([a-z]{2})$/;

/**
 * Converte um slug completo (`atibaia-sp`) para o href público da Página
 * Regional (`/sp/regiao/atibaia`).
 *
 * Em caso de slug fora do padrão (sem sufixo -uf), retorna o href legado
 * como fallback seguro — os redirects 301 da rota legada encaminham
 * corretamente para qualquer destino.
 */
export function slugToAncoraHref(slug: string): string {
  const match = SLUG_UF_RE.exec(String(slug || "").toLowerCase());
  if (!match) return `/carros-usados/regiao/${encodeURIComponent(slug)}`;
  return `/${match[2]}/regiao/${match[1]}`;
}

/**
 * Constrói o href a partir de partes já separadas.
 * `ancoraHrefFromParts("sp", "atibaia")` → `/sp/regiao/atibaia`
 */
export function ancoraHrefFromParts(uf: string, ancora: string): string {
  const ufNorm = String(uf || "").trim().toLowerCase().slice(0, 2);
  const ancoraNorm = String(ancora || "").trim().toLowerCase();
  if (!ufNorm || !ancoraNorm) return "/";
  return `/${ufNorm}/regiao/${ancoraNorm}`;
}

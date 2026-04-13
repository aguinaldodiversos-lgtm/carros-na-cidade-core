/**
 * Configuração pública do portal.
 *
 * Objetivos:
 * - Centralizar a cidade pública padrão em um único lugar
 * - Permitir override por env sem alterar código
 * - Manter retrocompatibilidade com exports antigos
 * - Evitar espalhar fallback rígido de cidade pelo portal
 *
 * Observação importante:
 * A cidade padrão pública serve para contexto de navegação/SEO/hubs.
 * Ela NÃO deve ser usada automaticamente para zerar listagens em páginas
 * como /comprar quando o utilizador não escolheu território.
 */

export type SocialLink = {
  label: string;
  href: string;
};

export type PublicCityConfig = {
  slug: string;
  label: string;
  name: string;
  state: string;
};

const FALLBACK_PUBLIC_CITY: PublicCityConfig = {
  slug: "sao-paulo-sp",
  label: "São Paulo",
  name: "São Paulo",
  state: "SP",
};

/** Posicionamento regional — evite linguagem de “marketplace nacional genérico”. */
export const REGIONAL_BRAND_TAGLINE = "Carros de verdade, cidade por cidade.";

export const REGIONAL_VALUE_PROPOSITION =
  "Cada anúncio nasce em um território: cidade e estado guiam a busca, o preço e a negociação — sem diluir o que importa no seu dia a dia.";

function readEnv(name: string): string {
  return process.env[name]?.trim() || "";
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeCitySlug(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function isLikelyCitySlug(value: string): boolean {
  const slug = normalizeCitySlug(value);
  if (!slug) return false;

  const parts = slug.split("-").filter(Boolean);
  if (parts.length < 2) return false;

  const maybeUf = parts[parts.length - 1];
  return /^[a-z]{2}$/.test(maybeUf);
}

function parseNameAndStateFromSlug(slug: string): { name: string; state: string } | null {
  const normalized = normalizeCitySlug(slug);
  if (!isLikelyCitySlug(normalized)) return null;

  const parts = normalized.split("-").filter(Boolean);
  const uf = parts[parts.length - 1]?.toUpperCase();
  const cityParts = parts.slice(0, -1);

  const cityName = cityParts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .trim();

  if (!cityName || !uf) return null;

  return {
    name: cityName,
    state: uf,
  };
}

function sanitizeLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildPublicCityConfig(): PublicCityConfig {
  const envSlug = normalizeCitySlug(readEnv("NEXT_PUBLIC_DEFAULT_CITY_SLUG"));
  const envLabel = sanitizeLabel(readEnv("NEXT_PUBLIC_DEFAULT_CITY_LABEL"));

  if (!envSlug) {
    return FALLBACK_PUBLIC_CITY;
  }

  if (!isLikelyCitySlug(envSlug)) {
    return FALLBACK_PUBLIC_CITY;
  }

  const parsed = parseNameAndStateFromSlug(envSlug);
  if (!parsed) {
    return FALLBACK_PUBLIC_CITY;
  }

  return {
    slug: envSlug,
    label: envLabel || parsed.name,
    name: parsed.name,
    state: parsed.state,
  };
}

function isValidAbsoluteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeAbsoluteUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || !isValidAbsoluteUrl(trimmed)) return "";
  return stripTrailingSlashes(trimmed);
}

const PUBLIC_CITY = buildPublicCityConfig();

/**
 * Exports legados — mantidos por compatibilidade.
 * Preferir `getPublicDefaultCity()` em código novo.
 */
export const DEFAULT_PUBLIC_CITY_SLUG = PUBLIC_CITY.slug;
export const DEFAULT_PUBLIC_CITY_LABEL = PUBLIC_CITY.label;

/**
 * Retorna a configuração completa da cidade pública padrão.
 * Use este helper em código novo em vez de depender só de slug/label soltos.
 */
export function getPublicDefaultCity(): PublicCityConfig {
  return PUBLIC_CITY;
}

/**
 * Ajuda a identificar se houve override explícito por env.
 * Útil para debugging/observabilidade e ambientes diferentes.
 */
export function hasExplicitPublicDefaultCityConfig(): boolean {
  return Boolean(readEnv("NEXT_PUBLIC_DEFAULT_CITY_SLUG"));
}

/** Links de rede social — só entram itens com URL absoluta válida. */
export function getPublicSocialLinks(): SocialLink[] {
  const candidates = [
    {
      label: "Instagram",
      href: normalizeAbsoluteUrl(readEnv("NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL")),
    },
    {
      label: "Facebook",
      href: normalizeAbsoluteUrl(readEnv("NEXT_PUBLIC_SOCIAL_FACEBOOK_URL")),
    },
    {
      label: "LinkedIn",
      href: normalizeAbsoluteUrl(readEnv("NEXT_PUBLIC_SOCIAL_LINKEDIN_URL")),
    },
  ];

  return candidates.filter((item): item is SocialLink => Boolean(item.href));
}

/**
 * Hub da cidade pública padrão.
 *
 * Importante:
 * este helper é apropriado para navegação institucional/SEO/hub.
 * Não use este valor para impor filtro territorial silencioso em páginas
 * de catálogo aberto como /comprar.
 */
export function getDefaultCityHubHref(): string {
  return `/cidade/${PUBLIC_CITY.slug}`;
}

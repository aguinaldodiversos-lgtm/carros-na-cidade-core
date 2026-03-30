/**
 * Valores públicos do portal (cidade padrão, redes sociais opcionais).
 * Redes: defina NEXT_PUBLIC_SOCIAL_* no .env para exibir; caso contrário, o UI oculta os ícones.
 */

export const DEFAULT_PUBLIC_CITY_SLUG = "sao-paulo-sp";
export const DEFAULT_PUBLIC_CITY_LABEL = "São Paulo";

/** Posicionamento regional — evite linguagem de “marketplace nacional genérico”. */
export const REGIONAL_BRAND_TAGLINE = "Carros de verdade, cidade por cidade.";

export const REGIONAL_VALUE_PROPOSITION =
  "Cada anúncio nasce em um território: cidade e estado guiam a busca, o preço e a negociação — sem diluir o que importa no seu dia a dia.";

export type SocialLink = {
  label: string;
  href: string;
};

/** Links de rede social — só entram itens com URL definida no build (NEXT_PUBLIC_*). */
export function getPublicSocialLinks(): SocialLink[] {
  const instagram = process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL?.trim();
  const facebook = process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK_URL?.trim();
  const linkedin = process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN_URL?.trim();

  const out: SocialLink[] = [];
  if (instagram) out.push({ label: "Instagram", href: instagram });
  if (facebook) out.push({ label: "Facebook", href: facebook });
  if (linkedin) out.push({ label: "LinkedIn", href: linkedin });
  return out;
}

export function getDefaultCityHubHref(): string {
  return `/cidade/${DEFAULT_PUBLIC_CITY_SLUG}`;
}

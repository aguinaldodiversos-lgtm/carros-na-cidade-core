/**
 * Assets de marca em `public/images`.
 * Ajuste apenas estes caminhos se os arquivos no disco tiverem outro nome/extensão.
 */
export const SITE_LOGO_SRC = "/images/logo-carros-na-cidade.png";

/** Ícone da aba / PWA — PNG oficial em `public/images`. */
export const SITE_FAVICON_SRC = "/images/favicon.png";

/** Banner principal da Home (layout premium). */
export const HOME_HERO_BANNER: string = "/images/home-hero-banner.png";

/** Mantido por compatibilidade com pontos que ainda importam a lista. */
export const HOME_HERO_BANNER_IMAGES: readonly string[] = [HOME_HERO_BANNER];

/** Open Graph / Twitter — primeiro banner; fallback no logo. */
export const SITE_OG_IMAGE_PATH = HOME_HERO_BANNER_IMAGES[0] ?? SITE_LOGO_SRC;

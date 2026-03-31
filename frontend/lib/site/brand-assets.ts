/**
 * Assets de marca em `public/images`.
 * Ajuste apenas estes caminhos se os arquivos no disco tiverem outro nome/extensão.
 */
export const SITE_LOGO_SRC = "/images/logo.svg";

/** Ícone da aba / PWA — mesmo arquivo referenciado em metadata. */
export const SITE_FAVICON_SRC = "/images/favicon.svg";

/**
 * Banners do carrossel da Home (ordem de exibição).
 * Formatos comuns: png, jpg, webp.
 */
export const HOME_HERO_BANNER_IMAGES: readonly string[] = [
  "/images/home-banner-1.png",
  "/images/home-banner-2.png",
];

/** Open Graph / Twitter — primeiro banner; fallback no logo. */
export const SITE_OG_IMAGE_PATH = HOME_HERO_BANNER_IMAGES[0] ?? SITE_LOGO_SRC;

/**
 * Assets de marca em `public/images`.
 * Ajuste apenas estes caminhos se os arquivos no disco tiverem outro nome/extensão.
 */
export const SITE_LOGO_SRC = "/images/logo-carros-na-cidade.png";

/** Ícone da aba / PWA — PNG oficial em `public/images`. */
export const SITE_FAVICON_SRC = "/images/favicon.png";

/**
 * Banner principal da Home (layout premium).
 *
 * Imagem cinematográfica 1600×686 (≈2.33:1) entregue pelo usuário em
 * `imagem-banner.png`, processada para JPG mozjpeg q85 (~94KB) e salva
 * como `home-hero-banner.jpg`. Composição: SUV prata em movimento na
 * estrada (lado direito) + skyline da cidade ao fundo + igreja sobre
 * o monte à direita + GRADIENTE NAVY ESCURO À ESQUERDA — exatamente
 * onde o texto do hero (h1, pílula da cidade, CTA) é renderizado pelo
 * componente.
 *
 * O `.png` antigo (sprite low-res ~480x256) foi mantido em disco para
 * histórico mas não é mais referenciado.
 */
export const HOME_HERO_BANNER: string = "/images/home-hero-banner.jpg";

/** Mantido por compatibilidade com pontos que ainda importam a lista. */
export const HOME_HERO_BANNER_IMAGES: readonly string[] = [HOME_HERO_BANNER];

/** Open Graph / Twitter — primeiro banner; fallback no logo. */
export const SITE_OG_IMAGE_PATH = HOME_HERO_BANNER_IMAGES[0] ?? SITE_LOGO_SRC;

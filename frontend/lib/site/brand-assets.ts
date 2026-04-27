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
 * `home-hero-banner.png` foi extraído do sprite enviado pelo usuário
 * (`banner e icones.png` em `public/images/`) via
 * `scripts/extract-home-assets.mjs` — região do banner mostrando cidade +
 * SUV prata + igreja + pin, SEM texto sobreposto (que vinha quebrado por
 * artefato de OCR no sprite original).
 *
 * O banner antigo (`banner-home.png`) tinha texto pré-renderizado
 * embutido ("O portal de carros usados...") que vazava em desktop. Esta
 * versão limpa permite que H1, CTA e badges fiquem só na camada HTML.
 */
export const HOME_HERO_BANNER: string = "/images/home-hero-banner.png";

/** Mantido por compatibilidade com pontos que ainda importam a lista. */
export const HOME_HERO_BANNER_IMAGES: readonly string[] = [HOME_HERO_BANNER];

/** Open Graph / Twitter — primeiro banner; fallback no logo. */
export const SITE_OG_IMAGE_PATH = HOME_HERO_BANNER_IMAGES[0] ?? SITE_LOGO_SRC;

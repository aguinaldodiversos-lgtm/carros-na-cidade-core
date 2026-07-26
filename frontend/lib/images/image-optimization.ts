/**
 * Decide se deve pular o otimizador do next/image.
 *
 * Pulamos quando o ganho de otimização do Next é nulo OU quando re-otimizar
 * geraria um caminho duplo de tráfego pelo Render — o que estourou o
 * outbound bandwidth no incidente de 2026-05-13.
 *
 * Regras:
 *   - SVG e data: URIs       — já são vetoriais/inline, não há ganho.
 *   - Mesma origem do app    — `/api/vehicle-images`, `/uploads/`,
 *                              `/_next/image` (idempotência), `/images/`:
 *                              re-otimizar manda o Render baixar a imagem
 *                              de si mesmo para servir variantes. Trip duplo.
 *   - Host R2 público        — definido por NEXT_PUBLIC_R2_PUBLIC_BASE_URL.
 *                              Já é CDN edge cacheada; otimizar adicionaria
 *                              salto Render no meio.
 *   - Domínio próprio        — `*.carrosnacidade.com` (ex.: o
 *                              `img.carrosnacidade.com` que serve o bucket R2
 *                              desde 2026-07-26). Mesma razão.
 *   - *.onrender.com         — qualquer host do Render (backend Express,
 *                              outros serviços nossos): mesma razão.
 *
 * Para Unsplash/CMS externo, mantemos otimização (next/image gera variantes
 * pequenas e o Render economiza banda repassando WebP/AVIF).
 */

const ONRENDER_DOMAIN_SUFFIX = ".onrender.com";

// Cloudflare R2 sempre expõe buckets públicos em `*.r2.dev` (ou em
// `*.r2.cloudflarestorage.com` para o endpoint interno).  Reconhecemos os
// dois sufixos por padrão para que o skip funcione mesmo quando
// NEXT_PUBLIC_R2_PUBLIC_BASE_URL não está setado no Render — esse era o
// agujero exato pelo qual imagens R2 ainda viravam /_next/image após o
// primeiro fix em 2026-05-13.
const R2_DOMAIN_SUFFIXES = [".r2.dev", ".r2.cloudflarestorage.com"];

// Domínio próprio na frente do bucket R2 (`img.carrosnacidade.com`, migração
// 2026-07-26 para sair do endpoint `r2.dev`, que é o *public development URL*
// da Cloudflare e é limitado por taxa).
//
// Sem esta entrada o host novo não casaria NENHUMA regra de skip: não termina
// em `.r2.dev` nem em `.onrender.com`, e o fallback por
// NEXT_PUBLIC_R2_PUBLIC_BASE_URL só funciona se a env estiver presente no
// BUILD — que foi exatamente o buraco de 2026-05-13. Sufixo do nosso domínio
// cobre qualquer subdomínio futuro e é semanticamente certo: imagem em origem
// nossa nunca deve dar a volta pelo otimizador do Render.
const SELF_DOMAIN_SUFFIXES = [".carrosnacidade.com"];

const SAME_ORIGIN_PREFIXES = ["/api/vehicle-images", "/uploads/", "/_next/image", "/images/"];

function getPublicR2Host(): string | null {
  const raw = (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "").trim();
  if (!raw) return null;
  try {
    return new URL(raw).host.toLowerCase();
  } catch {
    return null;
  }
}

function isR2Host(host: string): boolean {
  return R2_DOMAIN_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function isSelfHost(host: string): boolean {
  return SELF_DOMAIN_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export function shouldSkipNextImageOptimizer(url: string): boolean {
  if (!url) return true;
  if (url.startsWith("data:")) return true;
  if (url.endsWith(".svg")) return true;

  if (url.startsWith("/")) {
    for (const prefix of SAME_ORIGIN_PREFIXES) {
      if (url.startsWith(prefix)) return true;
    }
    return false;
  }

  if (/^https?:\/\//i.test(url)) {
    try {
      const host = new URL(url).host.toLowerCase();
      if (isR2Host(host)) return true;
      if (isSelfHost(host)) return true;
      const r2Host = getPublicR2Host();
      if (r2Host && host === r2Host) return true;
      if (host.endsWith(ONRENDER_DOMAIN_SUFFIX)) return true;
      return false;
    } catch {
      return true;
    }
  }

  return false;
}

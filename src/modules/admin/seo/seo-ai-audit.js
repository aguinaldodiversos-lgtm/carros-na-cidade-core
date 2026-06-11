/**
 * Auditoria SEO/IA — analisadores PUROS (Fase 4.3, §14).
 *
 * Recebem linhas já carregadas (anúncios / posts de blog) e devolvem um
 * relatório de problemas que prejudicam a leitura por busca tradicional e
 * por sistemas de IA. Sem I/O — o script scripts/seo/audit-seo-ai.mjs faz
 * o SELECT e chama estas funções (testáveis sem banco).
 */

import { calculateAdSeoAiScore, countAdImages, buildAdImageAlt } from "../ads/ad-seo-ai-score.js";

function str(v) {
  return v == null ? "" : String(v).trim();
}
function num(v) {
  if (v == null || v === "") return null;
  const n = Number(
    String(v)
      .replace(/[^\d.,-]/g, "")
      .replace(",", ".")
  );
  return Number.isFinite(n) ? n : null;
}

/**
 * Analisa anúncios ATIVOS (os públicos/indexáveis). Cada problema:
 * { ad_id, slug, kind, severity, detail }.
 */
export function analyzeAds(ads = []) {
  const problems = [];
  let scoreSum = 0;
  let ready = 0; // score >= 80

  for (const ad of ads) {
    const id = ad.id ?? ad.ad_id ?? null;
    const slug = str(ad.slug);
    const push = (kind, severity, detail) =>
      problems.push({ ad_id: id, slug, kind, severity, detail });

    if (num(ad.price) == null || num(ad.price) <= 0) {
      push("ad_without_price", "high", "Anúncio ativo sem preço válido (sem Offer).");
    }
    if (!str(ad.city) && !str(ad.city_name)) {
      push("ad_without_city", "high", "Anúncio ativo sem cidade — perde contexto local.");
    }
    if (countAdImages(ad) === 0) {
      push("ad_without_image", "high", "Anúncio ativo sem nenhuma imagem.");
    } else if (countAdImages(ad) < 3) {
      push("ad_few_images", "low", "Anúncio com menos de 3 fotos.");
    }
    if (!buildAdImageAlt(ad)) {
      push("ad_without_alt", "medium", "Não foi possível gerar alt (faltam marca/modelo/cidade).");
    }
    if (str(ad.description).length < 120) {
      push("ad_short_description", "low", "Descrição curta (<120 caracteres).");
    }

    const { score } = calculateAdSeoAiScore(ad);
    scoreSum += score;
    if (score >= 80) ready += 1;
  }

  return {
    total: ads.length,
    avg_score: ads.length ? Math.round(scoreSum / ads.length) : 0,
    ready_80_plus: ready,
    problems,
  };
}

/**
 * Analisa posts de blog do CMS (source='cms'). Verifica o que o §14 pede:
 * publicados sem meta description, conteúdo curto, slug inválido. Também
 * detecta slugs duplicados no conjunto.
 */
export function analyzeBlogPosts(posts = []) {
  const problems = [];
  const seenSlugs = new Map();

  for (const post of posts) {
    const id = post.id ?? null;
    const slug = str(post.slug);
    const status = str(post.status);
    const push = (kind, severity, detail) =>
      problems.push({ post_id: id, slug, kind, severity, detail });

    if (slug) {
      seenSlugs.set(slug, (seenSlugs.get(slug) || 0) + 1);
    }

    if (status === "published") {
      const metaDesc = str(post.meta_description) || str(post.excerpt);
      if (!metaDesc) {
        push(
          "post_without_meta_description",
          "medium",
          "Post publicado sem meta description nem excerpt."
        );
      } else if (metaDesc.length > 160) {
        push(
          "post_meta_description_long",
          "low",
          `Meta description com ${metaDesc.length} caracteres (ideal ≤160).`
        );
      }
      if (str(post.content).length < 300) {
        push(
          "post_short_content",
          "medium",
          "Post publicado com conteúdo curto (<300 caracteres)."
        );
      }
      if (!str(post.cover_image_url)) {
        push("post_without_cover", "low", "Post publicado sem imagem de capa.");
      }
    }

    if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      push("post_invalid_slug", "medium", `Slug fora do padrão: "${slug}".`);
    }
  }

  for (const [slug, count] of seenSlugs.entries()) {
    if (count > 1) {
      problems.push({
        post_id: null,
        slug,
        kind: "post_duplicate_slug",
        severity: "high",
        detail: `Slug "${slug}" aparece ${count}x.`,
      });
    }
  }

  const published = posts.filter((p) => str(p.status) === "published").length;
  return { total: posts.length, published, problems };
}

/** Sumariza problemas por severidade (para o cabeçalho do relatório). */
export function summarizeProblems(...lists) {
  const all = lists.flat();
  const bySeverity = { high: 0, medium: 0, low: 0 };
  for (const p of all) {
    if (p.severity in bySeverity) bySeverity[p.severity] += 1;
  }
  return { total: all.length, ...bySeverity };
}

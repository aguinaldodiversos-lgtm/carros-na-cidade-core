// src/read-models/cities/inventory-facets.service.js
//
// Facetas DERIVADAS DO INVENTÁRIO para o rodapé público.
//
// Motivação (auditoria 2026-07-28): o rodapé é global — aparece em toda página
// — e era 100% hardcoded. Listava São Paulo, Campinas, Santos, Ribeirão Preto,
// São José dos Campos e Sorocaba (todas com ZERO anúncios) e cinco modelos dos
// quais só um existia no catálogo. Nenhum link para Atibaia, a única cidade com
// estoque. O Search Console reportava "Nenhuma página de referência detectada"
// para `/carros-em/atibaia-sp`: o site inteiro não linkava a própria cidade que
// tinha o que vender.
//
// Aqui tudo sai de `ads` com `status='active'`. Coluna sem dado vira coluna
// oculta no frontend — nunca um link para página vazia.

import { pool } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";
import {
  brandModelSlug,
  canonicalBrandLabel,
  canonicalBrandSlug,
} from "../../shared/utils/slugify.js";

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 12;

function clampLimit(raw) {
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

/**
 * Cidades com estoque ativo, da maior para a menor.
 *
 * Devolve `name` e `state` REAIS da tabela `cities` — nunca derivados do slug.
 * Derivar quebraria em acento: "sao-paulo-sp" viraria "Sao Paulo", e o rodapé
 * exibiria nome errado em toda página do site.
 */
export async function getTopCitiesByInventory(limit = DEFAULT_LIMIT) {
  const result = await pool.query(
    `
    SELECT c.slug, c.name, c.state, COUNT(a.id)::int AS total
    FROM cities c
    INNER JOIN ads a
      ON a.city_id = c.id
     AND a.status = 'active'
    GROUP BY c.id, c.slug, c.name, c.state
    ORDER BY total DESC, c.name ASC
    LIMIT $1
    `,
    [clampLimit(limit)]
  );

  return result.rows
    .filter((r) => r.slug && r.name)
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      state: r.state || null,
      total: Number(r.total || 0),
    }));
}

/**
 * Modelos com estoque ativo NA CIDADE informada.
 *
 * Os slugs saem prontos daqui, gerados pelas MESMAS funções que o resolver de
 * `/cidade/{c}/marca/{b}/modelo/{m}` usa para casar a URL com o valor real
 * (`matchRowsBySlug` aplica `canonicalBrandSlug` em marca e `brandModelSlug`
 * em modelo, dos dois lados). Gerando o link a partir do valor real do banco,
 * o casamento é garantido POR CONSTRUÇÃO — não por conferência manual.
 *
 * É por isso que os slugs não são montados no frontend: duplicar a regra lá
 * reintroduziria o risco de "0 anúncios" por divergência das duas
 * implementações.
 *
 * `label` é o rótulo curto de exibição; a URL usa sempre o modelo COMPLETO
 * ("HB20 Sense Plus 1.0 Flex 12V Mec."), que é o que existe em `ads.model`.
 */
export async function getTopModelsForCity(citySlug, limit = DEFAULT_LIMIT) {
  const slug = String(citySlug ?? "").trim();
  if (!slug) return [];

  const result = await pool.query(
    `
    SELECT a.brand, a.model, COUNT(*)::int AS total
    FROM ads a
    INNER JOIN cities c ON c.id = a.city_id
    WHERE a.status = 'active'
      AND c.slug = $1
      AND a.brand IS NOT NULL AND TRIM(a.brand) <> ''
      AND a.model IS NOT NULL AND TRIM(a.model) <> ''
    GROUP BY a.brand, a.model
    ORDER BY total DESC, a.brand ASC, a.model ASC
    LIMIT $2
    `,
    [slug, clampLimit(limit)]
  );

  return result.rows
    .map((r) => {
      const brandSlug = canonicalBrandSlug(r.brand);
      const modelSlug = brandModelSlug(r.model);
      // Slug vazio = link quebrado. Descarta em vez de publicar link morto.
      if (!brandSlug || !modelSlug) return null;
      return {
        brand: canonicalBrandLabel(r.brand),
        model: String(r.model).trim(),
        label: buildShortModelLabel(r.brand, r.model),
        brandSlug,
        modelSlug,
        total: Number(r.total || 0),
      };
    })
    .filter(Boolean);
}

/**
 * Tokens que marcam o início da ficha técnica no padrão FIPE. A partir do
 * primeiro deles o rótulo é cortado: "HB20 Sense Plus 1.0 Flex 12V Mec." vira
 * "Hyundai HB20 Sense Plus".
 *
 * Só afeta EXIBIÇÃO — a URL continua usando o modelo completo.
 */
const SPEC_TOKEN_RE =
  /^(?:\d+[.,]\d+|\d+v|\d+p|flex|gas(?:olina)?|die(?:sel)?|alc(?:ool)?|mec\.?|aut\.?|automatico|manual|cvt|tb|turbo|4x4|4x2|16v|8v|12v)$/i;

const MAX_LABEL_TOKENS = 3;

export function buildShortModelLabel(brand, model) {
  const brandLabel = canonicalBrandLabel(brand);
  const tokens = String(model ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const kept = [];
  for (const token of tokens) {
    if (kept.length > 0 && SPEC_TOKEN_RE.test(token)) break;
    kept.push(token);
    if (kept.length >= MAX_LABEL_TOKENS) break;
  }

  const shortModel = kept.join(" ") || String(model ?? "").trim();
  return [brandLabel, shortModel].filter(Boolean).join(" ").trim();
}

/**
 * Payload do rodapé: cidades por estoque + modelos da cidade mais forte.
 *
 * Os modelos são de UMA cidade (a de maior estoque) de propósito: rotular
 * "modelos disponíveis em Atibaia" é honesto e cada link leva a uma página de
 * cluster com resultado. Um "top modelos nacional" misturaria cidades e
 * produziria links que não resolvem para a cidade exibida.
 *
 * NUNCA lança: erro de banco vira lista vazia + log, e o rodapé oculta a
 * coluna. Um rodapé é chrome global — não pode derrubar a página inteira.
 */
export async function getFooterInventoryFacets({ cityLimit, modelLimit } = {}) {
  let cities = [];
  try {
    cities = await getTopCitiesByInventory(cityLimit);
  } catch (err) {
    logger.error(
      { err: err?.message || String(err) },
      "[inventory-facets] falha ao listar cidades por estoque — coluna do rodapé sai vazia"
    );
  }

  const topCity = cities[0] || null;
  let models = [];
  if (topCity) {
    try {
      models = await getTopModelsForCity(topCity.slug, modelLimit);
    } catch (err) {
      logger.error(
        { err: err?.message || String(err), citySlug: topCity.slug },
        "[inventory-facets] falha ao listar modelos da cidade — coluna do rodapé sai vazia"
      );
    }
  }

  return {
    cities,
    models,
    modelsCity: topCity ? { slug: topCity.slug, name: topCity.name, state: topCity.state } : null,
  };
}

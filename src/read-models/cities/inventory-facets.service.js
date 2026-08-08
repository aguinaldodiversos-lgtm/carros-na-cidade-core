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
import { canonicalBrandLabel, canonicalBrandSlug } from "../../shared/utils/slugify.js";
import { deriveCommercialModel } from "../../shared/vehicle/commercial-model.js";
import { SEO_SURFACE, qualifiesForSeoSurface } from "./city-thresholds.js";

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
 * MODELO COMERCIAL (Fase 3): a URL usa a entidade ("onix"), não a descrição
 * FIPE ("onix-hatch-lt-1-0-12v-flex-5p-mec"). Antes o rodapé — que é chrome
 * GLOBAL, presente em toda página do site — linkava para as descrições FIPE,
 * e cada uma delas é um recorte de 1-2 anúncios, portanto `noindex`. O
 * rodapé inteiro apontava para páginas que o próprio site pede para não
 * indexar. Só entram modelos que QUALIFICAM (>= limiar de modelo): abaixo
 * disso o link seria para um `noindex` de novo.
 *
 * A agregação por entidade acontece em JS porque a derivação do modelo
 * comercial não cabe em SQL — por isso a query traz mais linhas do que o
 * limite final e o corte é aplicado depois de somar.
 */
export async function getTopModelsForCity(citySlug, limit = DEFAULT_LIMIT) {
  const slug = String(citySlug ?? "").trim();
  if (!slug) return [];

  const safeLimit = clampLimit(limit);

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
    `,
    [slug]
  );

  return aggregateCommercialModels(result.rows, safeLimit);
}

/**
 * PURA: linhas (marca, descrição FIPE, total) → modelos comerciais
 * qualificados, ordenados por volume. Testável sem DB.
 */
export function aggregateCommercialModels(rows, limit = DEFAULT_LIMIT) {
  const byEntity = new Map();

  for (const r of Array.isArray(rows) ? rows : []) {
    const brandSlug = canonicalBrandSlug(r.brand);
    const commercial = deriveCommercialModel(r.model, { brand: r.brand });
    // Sem marca ou sem modelo comercial derivável = link que não resolve.
    // Descarta em vez de publicar link morto.
    if (!brandSlug || !commercial) continue;

    const key = `${brandSlug}::${commercial.slug}`;
    const current = byEntity.get(key);
    const total = Number(r.total || 0);

    if (!current) {
      byEntity.set(key, {
        brand: canonicalBrandLabel(r.brand),
        model: commercial.label,
        label: `${canonicalBrandLabel(r.brand)} ${commercial.label}`.trim(),
        brandSlug,
        modelSlug: commercial.slug,
        total,
      });
      continue;
    }
    current.total += total;
  }

  return [...byEntity.values()]
    .filter((m) => qualifiesForSeoSurface(SEO_SURFACE.MODEL, m.total))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "pt-BR"))
    .slice(0, clampLimit(limit));
}

// `buildShortModelLabel` foi REMOVIDO na Fase 3. Ele encurtava a descrição
// FIPE só para EXIBIÇÃO ("HB20 Sense Plus 1.0 Flex 12V Mec." → "Hyundai HB20
// Sense Plus") enquanto a URL continuava usando a descrição inteira — rótulo
// bonito, link para página noindex. `deriveCommercialModel` resolve os dois
// lados de uma vez: a entidade "HB20" é o rótulo E o slug.

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

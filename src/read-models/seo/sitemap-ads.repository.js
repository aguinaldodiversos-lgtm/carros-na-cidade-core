// src/read-models/seo/sitemap-ads.repository.js
//
// Fonte de verdade do sitemap de VEÍCULOS (`/veiculo/[slug]`) — as únicas
// páginas com conteúdo único do portal, que até então não estavam em nenhum
// sitemap. Baseado em ESTOQUE ATIVO real (tabela `ads`, `status = 'active'`).
//
// O `slug` é o valor ARMAZENADO em `ads.slug` (gerado com `Date.now()` na
// criação do anúncio — NÃO é reconstruível). Emitir a coluna direto garante que
// a URL casa com o lookup de `/veiculo/[slug]` (`findAdByIdentifier`:
// `a.slug = $1 AND a.status = 'active'`) e nunca gera 404. `lastmod` =
// `ads.updated_at`. Read-only.

import { pool } from "../../infrastructure/database/db.js";

/**
 * Anúncios ATIVOS com slug válido, do mais recente para o mais antigo. O limite
 * é saturado em 100k (o urlset de um sitemap suporta até 50k URLs; acima disso
 * seria necessário shardar — greenfield, não aplicável no volume atual).
 */
export async function listActiveAdRows(limit = 50000) {
  const safeLimit = Math.min(100000, Math.max(1, Number(limit) || 50000));

  const result = await pool.query(
    `
    SELECT
      slug,
      updated_at AS last_updated
    FROM ads
    WHERE status = 'active'
      AND slug IS NOT NULL
      AND btrim(slug) <> ''
    ORDER BY updated_at DESC NULLS LAST
    LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}

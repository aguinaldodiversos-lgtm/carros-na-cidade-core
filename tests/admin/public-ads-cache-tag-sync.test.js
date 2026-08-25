import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PUBLIC_ADS_CACHE_TAG as BACKEND_TAG } from "../../src/shared/cache/next-revalidate.js";
import { PUBLIC_ADS_CACHE_TAG as FRONTEND_TAG } from "../../frontend/lib/cache/public-ads-tag.ts";

/**
 * A tag do cache vive em TRÊS lugares: quem marca o fetch (frontend), quem
 * dispara (backend) e quem autoriza (allowlist da rota). Se qualquer um
 * divergir, a invalidação falha SILENCIOSAMENTE — a rota responde 200, o
 * backend loga sucesso, e o anúncio bloqueado continua no catálogo até o TTL.
 * Nenhum teste de comportamento pegaria isso; só a comparação direta pega.
 */
describe("tag public-ads — sincronia entre as três pontas", () => {
  it("backend e frontend usam a mesma string", () => {
    expect(BACKEND_TAG).toBe(FRONTEND_TAG);
  });

  it("a allowlist da rota de revalidação aceita a tag", () => {
    const route = readFileSync("frontend/app/api/revalidate/route.ts", "utf8");
    // A rota importa a constante em vez de repetir o literal — é isso que
    // torna a divergência impossível de acontecer por digitação.
    expect(route).toMatch(/import \{ PUBLIC_ADS_CACHE_TAG \} from "@\/lib\/cache\/public-ads-tag"/);
    expect(route).toMatch(/ALLOWED_TAGS[\s\S]{0,400}PUBLIC_ADS_CACHE_TAG/);
  });

  it("toda vitrine pública de anúncios carrega a tag", () => {
    // Se um fetch novo aparecer sem a tag, o anúncio bloqueado continuaria
    // visível ali. A lista abaixo é o mapa da auditoria de cache.
    const surfaces = [
      "frontend/lib/search/ads-search.ts",
      "frontend/lib/search/catalog-ads-territory-fallback.ts",
      "frontend/lib/search/territorial-public.ts",
      "frontend/lib/dealers/fetch-public-dealer.ts",
      "frontend/lib/buy/city-radius-catalog.ts",
      "frontend/lib/seo/city-seo-overview.ts",
      "frontend/lib/seo/sitemap-client.ts",
      "frontend/lib/home/public-home.ts",
      "frontend/lib/home/home-discovery.ts",
      "frontend/lib/regions/fetch-region.ts",
    ];
    for (const file of surfaces) {
      const src = readFileSync(file, "utf8");
      expect(src, `${file} não marca a tag public-ads`).toMatch(
        /PUBLIC_ADS_CACHE_TAG|withPublicAdsTag/
      );
    }
  });
});

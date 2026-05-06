import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalSeoLandingModel, LocalSeoVariant } from "@/lib/seo/local-seo-data";

/**
 * Integração da Fase 3 da auditoria territorial: garante que as 3 page.tsx
 * de landing local-SEO produzem canonical/robots/title corretos quando
 * chamadas ponta-a-ponta via `createLocalSeoPage(variant)`.
 *
 * `local-seo-metadata.test.ts` já cobre `buildLocalSeoMetadata` em isolamento.
 * Este teste blinda o caminho integrado:
 *
 *   page.tsx → createLocalSeoPage(variant)
 *            → load(slug) [mock de loadLocalSeoLanding]
 *            → buildLocalSeoMetadata(model)
 *            → Metadata
 *
 * Por design, `generateMetadata` em `local-seo-route.tsx` SÓ aceita `{ params }`
 * — não há `searchParams` na signature, então é impossível vazar query string
 * pelo caminho normal. Os testes capturam essa propriedade e travam regressão.
 *
 * Mock surface mínima — só o que é server-only ou puxa I/O:
 *   - server-only (stub vazio)
 *   - react.cache (passthrough; em vitest node React Server Components API vira undefined)
 *   - loadLocalSeoLanding (retorna LocalSeoLandingModel controlado)
 *   - LocalSeoLanding component (não importa pra metadata)
 */

vi.mock("server-only", () => ({}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
  };
});

function buildModel(variant: LocalSeoVariant, slug = "atibaia-sp"): LocalSeoLandingModel {
  return {
    variant,
    slug,
    cityName: "Atibaia",
    state: "SP",
    region: null,
    totalAds: 12,
    catalogTotalAds: 30,
    avgPrice: 45000,
    topBrands: [{ brand: "Honda", total: 4 }],
    sampleAds: [
      {
        id: 1,
        title: "Honda Civic 2018",
        slug: "honda-civic-2018",
        brand: "Honda",
        model: "Civic",
        year: 2018,
        price: 60000,
        image_url: "/images/sample.jpg",
      },
    ],
    isEmptyVariant: false,
    isEmptyCity: false,
    comprarHref: `/comprar?city_slug=${slug}`,
    hubHref: `/cidade/${slug}`,
    paths: {
      em: `/carros-em/${slug}`,
      baratos: `/carros-baratos-em/${slug}`,
      automaticos: `/carros-automaticos-em/${slug}`,
    },
    h1: "Carros em Atibaia (SP)",
    paragraphs: [],
  } as unknown as LocalSeoLandingModel;
}

vi.mock("@/lib/seo/local-seo-data", async () => {
  const actual = await vi.importActual<typeof import("@/lib/seo/local-seo-data")>(
    "@/lib/seo/local-seo-data"
  );
  return {
    ...actual,
    loadLocalSeoLanding: vi.fn(async (slug: string, variant: LocalSeoVariant) =>
      buildModel(variant, slug)
    ),
  };
});

// Component pesado, fora do escopo de metadata
vi.mock("@/components/seo/LocalSeoLanding", () => ({
  LocalSeoLanding: () => null,
}));

import { generateMetadata as generateMetadataEm } from "@/app/carros-em/[slug]/page";
import { generateMetadata as generateMetadataBaratos } from "@/app/carros-baratos-em/[slug]/page";
import { generateMetadata as generateMetadataAutomaticos } from "@/app/carros-automaticos-em/[slug]/page";

const SLUG = "atibaia-sp";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/carros-em/[slug] — generateMetadata (Fase 3 integrado)", () => {
  it("canonical = /carros-em/[slug] (URL absoluta, limpa)", async () => {
    const meta = await generateMetadataEm({ params: { slug: SLUG } });
    expect(meta.alternates?.canonical).toBe(
      `https://carrosnacidade.com/carros-em/${SLUG}`
    );
  });

  it("robots: index,follow (página indexável)", async () => {
    const meta = await generateMetadataEm({ params: { slug: SLUG } });
    expect(meta.robots).toMatchObject({ index: true, follow: true });
  });

  it("title NÃO termina com '| Carros na Cidade' (template do RootLayout adiciona)", async () => {
    const meta = await generateMetadataEm({ params: { slug: SLUG } });
    expect(String(meta.title)).not.toMatch(/\|\s*Carros na Cidade\s*$/);
    expect(String(meta.title)).toContain("Atibaia");
  });
});

describe("/carros-baratos-em/[slug] — generateMetadata (Fase 3 integrado)", () => {
  it("canonical = /carros-baratos-em/[slug] (URL absoluta, limpa)", async () => {
    const meta = await generateMetadataBaratos({ params: { slug: SLUG } });
    expect(meta.alternates?.canonical).toBe(
      `https://carrosnacidade.com/carros-baratos-em/${SLUG}`
    );
  });

  it("robots: index,follow (página indexável da intenção 'abaixo da FIPE')", async () => {
    const meta = await generateMetadataBaratos({ params: { slug: SLUG } });
    expect(meta.robots).toMatchObject({ index: true, follow: true });
  });

  it("title NÃO termina com '| Carros na Cidade'", async () => {
    const meta = await generateMetadataBaratos({ params: { slug: SLUG } });
    expect(String(meta.title)).not.toMatch(/\|\s*Carros na Cidade\s*$/);
    expect(String(meta.title)).toContain("baratos");
  });
});

describe("/carros-automaticos-em/[slug] — generateMetadata (Fase 3 integrado)", () => {
  it("canonical CONSOLIDADO em /carros-em/[slug] (a página é noindex)", async () => {
    // Política da Fase 1: /carros-automaticos-em é noindex,follow e
    // consolida sinal SEO na indexável da intenção mais próxima
    // (/carros-em). Confirmar que o canonical NÃO é self.
    const meta = await generateMetadataAutomaticos({ params: { slug: SLUG } });
    expect(meta.alternates?.canonical).toBe(
      `https://carrosnacidade.com/carros-em/${SLUG}`
    );
    expect(String(meta.alternates?.canonical)).not.toContain("automaticos");
  });

  it("robots: noindex,follow (não compete com /carros-em na indexação)", async () => {
    const meta = await generateMetadataAutomaticos({ params: { slug: SLUG } });
    expect(meta.robots).toMatchObject({ index: false, follow: true });
  });

  it("title NÃO termina com '| Carros na Cidade'", async () => {
    const meta = await generateMetadataAutomaticos({ params: { slug: SLUG } });
    expect(String(meta.title)).not.toMatch(/\|\s*Carros na Cidade\s*$/);
    expect(String(meta.title)).toContain("automáticos");
  });
});

describe("Fase 3 — invariantes globais (3 page.tsx integradas)", () => {
  it("nenhuma das 3 rotas emite canonical com query string", async () => {
    const metas = await Promise.all([
      generateMetadataEm({ params: { slug: SLUG } }),
      generateMetadataBaratos({ params: { slug: SLUG } }),
      generateMetadataAutomaticos({ params: { slug: SLUG } }),
    ]);

    for (const meta of metas) {
      const canonical = String(meta.alternates?.canonical || "");
      expect(canonical).not.toContain("?");
      expect(canonical).not.toMatch(/sort|limit|page|utm|brand|model/i);
    }
  });

  it("openGraph.url espelha a canonical em todas as 3 rotas", async () => {
    const metas = await Promise.all([
      generateMetadataEm({ params: { slug: SLUG } }),
      generateMetadataBaratos({ params: { slug: SLUG } }),
      generateMetadataAutomaticos({ params: { slug: SLUG } }),
    ]);

    for (const meta of metas) {
      expect(meta.openGraph?.url).toBe(meta.alternates?.canonical);
    }
  });

  it("nenhuma das 3 rotas duplica o sufixo '| Carros na Cidade' no title", async () => {
    const metas = await Promise.all([
      generateMetadataEm({ params: { slug: SLUG } }),
      generateMetadataBaratos({ params: { slug: SLUG } }),
      generateMetadataAutomaticos({ params: { slug: SLUG } }),
    ]);

    for (const meta of metas) {
      expect(String(meta.title)).not.toMatch(/\|\s*Carros na Cidade\s*$/);
    }
  });

  it("slug com caracteres URI-reservados é encodado no path do canonical", async () => {
    // Defesa contra slug malformado vindo do roteador. Slugs reais sempre
    // batem em /^[a-z0-9-]+-[a-z]{2}$/ — nada precisa encoding nesse formato.
    // Mas o helper usa encodeURIComponent: garante que slug "atibaia sp"
    // (com espaço, edge case) não vaza espaço cru no canonical.
    const meta = await generateMetadataEm({ params: { slug: "atibaia sp" } });
    const canonical = String(meta.alternates?.canonical || "");
    expect(canonical).not.toContain(" ");
    expect(canonical).toMatch(/atibaia(%20|\+)sp/);
  });
});

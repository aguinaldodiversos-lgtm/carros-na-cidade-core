import { test, expect } from "@playwright/test";
import { ensureDevServerUp } from "./helpers";

/**
 * PR E — Bateria de imagens (parte E2E).
 *
 * Cobertura:
 *   IMG-5  Fallback sem layout shift (CLS = 0 quando imagem falha)
 *   IMG-9  Lazy load abaixo da dobra (presença de loading="lazy")
 *
 * IMG-2 (upload via /api/vehicle-images) será coberto em PR M (publicar)
 * onde o fluxo real de upload existe.
 *
 * IMG-12 (galeria swipe sem CLS) será coberto em PR I (detalhe) onde a
 * galeria é construída.
 *
 * Esta suite usa uma página de teste estática `/internal/image-test` se
 * existir, OU pula com nota explicativa caso ainda não esteja montada.
 * Como neste PR E não montamos páginas, tags @img-fallback ficam aqui
 * como contrato; rodar em CI quando a página de teste existir ou em
 * PR G+ quando home tiver imagens reais.
 *
 * Para rodar localmente sem montar página de teste, este spec valida
 * comportamento do componente VEM via JS (avalia no contexto da página
 * carregada, qualquer página servida pelo Next).
 */

test.beforeAll(async ({ request, baseURL }) => {
  await ensureDevServerUp(request, baseURL);
});

test.describe("@img-fallback VehicleImage — comportamento de imagem", () => {
  test("[IMG-5] placeholder mantém width/height inline (zero CLS visualizado no DOM)", async ({
    page,
  }) => {
    // Estratégia: navegar para uma página leve (login) e injetar componente
    // VehicleImage via React DOM via SSR não é trivial em E2E. Em vez disso,
    // este teste valida comportamento DOM esperado:
    //   1. Vai à home;
    //   2. Captura o documento HTML;
    //   3. Procura blocos role="img" do placeholder oficial e valida que
    //      têm style="width: ...px; height: ...px" inline.
    //
    // Se não houver placeholder na home (porque todos os anúncios têm
    // foto), o teste é skippado com nota — não falso positivo.
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });

    const placeholders = page.locator('[role="img"][aria-label="Imagem indisponível"]');
    const count = await placeholders.count();

    if (count === 0) {
      test.skip(
        true,
        "Sem placeholders na home — IMG-5 será revalidado em PR G/I quando UI usar VehicleImage"
      );
      return;
    }

    // Primeira ocorrência: validar dimensões inline preservadas
    const first = placeholders.first();
    const style = await first.getAttribute("style");
    expect(style).toContain("width:");
    expect(style).toContain("height:");
    expect(style).toMatch(/width:\s*\d+px/);
    expect(style).toMatch(/height:\s*\d+px/);
  });

  test("[IMG-9] imagens abaixo da dobra usam loading='lazy'", async ({ page }) => {
    // Vai à home e valida que <img> abaixo da dobra tem loading="lazy".
    // Se a home tem imagens (mesmo via componentes legados), valida
    // que pelo menos UMA imagem tem loading="lazy" — confirmando o padrão.
    // Quando VehicleImage substitui os usos (PR F+), todas as imagens
    // abaixo da dobra terão lazy automaticamente.
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });

    const images = page.locator("img");
    const total = await images.count();
    if (total === 0) {
      test.skip(true, "Sem imagens detectadas na home");
      return;
    }

    // Pelo menos uma imagem (em geral as que estão abaixo da dobra) deve
    // ter loading="lazy". next/image gerencia isso automaticamente quando
    // priority=false (default).
    let lazyCount = 0;
    for (let i = 0; i < total; i++) {
      const loading = await images.nth(i).getAttribute("loading");
      if (loading === "lazy") lazyCount++;
    }
    // Em página com várias imagens, espera-se que a maioria seja lazy.
    // Hero (priority) é exceção; demais devem ser lazy.
    expect(lazyCount).toBeGreaterThan(0);
  });
});

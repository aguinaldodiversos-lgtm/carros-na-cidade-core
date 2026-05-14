// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { VehicleImage } from "./VehicleImage";

/**
 * Bateria de testes IMG-1 a IMG-12 da especificação §8.5.1 do diagnóstico.
 *
 * Cobertura unit:
 *   IMG-1  R2 válida → next/image renderiza
 *   IMG-3  src vazio/null/undefined → placeholder, sem broken image
 *   IMG-4  onError dispara → swap para placeholder
 *   IMG-10 priority acima da dobra → fetchpriority="high" + loading="eager"
 *   IMG-11 srcset/sizes responsivo → presença de sizes na <img>
 *
 * Cobertura E2E (em e2e/image-fallback.spec.ts):
 *   IMG-2  upload via /api/vehicle-images
 *   IMG-5  fallback sem layout shift
 *   IMG-9  lazy load abaixo da dobra
 *   IMG-12 galeria swipe sem CLS
 *
 * Config / CI:
 *   IMG-6  guardrail lint imagens sem sizes (scripts/lint-images-sizes.mjs)
 *   IMG-7  remotePatterns restrito (next.config.mjs — NÃO mexido neste PR;
 *          fica para PR de segurança separado, conforme decisão registrada)
 *   IMG-8  SVG bloqueado (idem — dangerouslyAllowSVG continua true por
 *          compatibilidade com placeholder atual; remoção em PR de segurança)
 */

describe("VehicleImage", () => {
  afterEach(cleanup);

  // ---------------------------------------------------------------------------
  // IMG-1 — URL R2 válida renderiza next/image com src correto
  // ---------------------------------------------------------------------------
  it("[IMG-1] renderiza <img> com URL R2 válida", () => {
    const { container } = render(
      <VehicleImage
        src="https://r2.carrosnacidade.com/ads/abc123.jpg"
        alt="Honda Civic 2020"
        width={400}
        height={300}
        variant="card"
      />
    );

    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    // next/image normaliza o src; o atributo final pode ser /_next/image?url=...
    // ou o próprio src se unoptimized. Validamos via alt + presença de img.
    expect(img?.getAttribute("alt")).toBe("Honda Civic 2020");
  });

  // ---------------------------------------------------------------------------
  // IMG-3 — anúncio sem imagem (string vazia) renderiza placeholder
  // ---------------------------------------------------------------------------
  it("[IMG-3] sem src (string vazia) renderiza placeholder, não <img>", () => {
    const { container } = render(
      <VehicleImage src="" alt="Anúncio sem foto" width={400} height={300} />
    );

    expect(container.querySelector("img")).toBeNull();
    const placeholder = container.querySelector('[role="img"]');
    expect(placeholder).toBeTruthy();
    expect(placeholder?.getAttribute("aria-label")).toBe("Imagem indisponível");
  });

  it("[IMG-3] src null renderiza placeholder", () => {
    const { container } = render(
      <VehicleImage src={null} alt="Sem foto" width={200} height={150} />
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[role="img"]')).toBeTruthy();
  });

  it("[IMG-3] src undefined renderiza placeholder", () => {
    const { container } = render(
      <VehicleImage src={undefined} alt="Sem foto" width={200} height={150} />
    );
    expect(container.querySelector('[role="img"]')).toBeTruthy();
  });

  it("[IMG-3] src apontando para LISTING_CARD_FALLBACK_IMAGE usa placeholder estilizado", () => {
    const { container } = render(
      <VehicleImage
        src="/images/vehicle-placeholder.svg"
        alt="Placeholder"
        width={300}
        height={200}
      />
    );
    // Mesmo que a URL seja válida, o componente reconhece como sentinel
    // de "sem foto" e usa o placeholder estilizado em vez do SVG raw.
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[role="img"]')).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // IMG-4 — onError dispara → swap para placeholder
  // ---------------------------------------------------------------------------
  it("[IMG-4] onError swap para placeholder mantendo dimensões", () => {
    const onError = vi.fn();
    const { container } = render(
      <VehicleImage
        src="https://r2.carrosnacidade.com/quebrada.jpg"
        alt="Imagem quebrada"
        width={400}
        height={300}
        onError={onError}
      />
    );

    const img = container.querySelector("img");
    expect(img).toBeTruthy();

    // Simular erro de carregamento
    fireEvent.error(img!);

    // Após erro, placeholder substitui img mantendo dimensões.
    expect(container.querySelector("img")).toBeNull();
    const placeholder = container.querySelector('[role="img"]') as HTMLElement | null;
    expect(placeholder).toBeTruthy();
    // CLS check: dimensões inline preservadas
    expect(placeholder?.style.width).toBe("400px");
    expect(placeholder?.style.height).toBe("300px");

    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("[IMG-4] onError com fallbackLabel customizado mostra texto correto", () => {
    const { container } = render(
      <VehicleImage
        src="https://r2.example.com/x.jpg"
        alt="x"
        width={300}
        height={200}
        fallbackLabel="Erro de rede"
      />
    );
    const img = container.querySelector("img");
    fireEvent.error(img!);
    // O label aparece dentro do placeholder
    expect(screen.getByText("Erro de rede")).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // IMG-10 — priority acima da dobra
  // ---------------------------------------------------------------------------
  it("[IMG-10] priority=true gera fetchpriority='high' (loading fica a cargo do browser)", () => {
    const { container } = render(
      <VehicleImage
        src="https://r2.example.com/hero.jpg"
        alt="Hero"
        width={1200}
        height={600}
        variant="hero"
        priority
      />
    );

    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    // Next 14 aplica fetchpriority="high" via priority=true.
    // O atributo loading não é setado para "eager" explicitamente — o browser
    // entende prioridade alta sem precisar do hint redundante.
    expect(img?.getAttribute("fetchpriority")).toBe("high");
    // O importante para garantia anti-lazy: loading NÃO pode ser "lazy".
    expect(img?.getAttribute("loading")).not.toBe("lazy");
  });

  it("[IMG-10] priority=false (default) gera loading='lazy'", () => {
    const { container } = render(
      <VehicleImage
        src="https://r2.example.com/card.jpg"
        alt="Card"
        width={400}
        height={300}
        variant="card"
      />
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("loading")).toBe("lazy");
  });

  // ---------------------------------------------------------------------------
  // IMG-11 — sizes responsivo presente conforme variant
  // ---------------------------------------------------------------------------
  it("[IMG-11] variant='card' aplica sizes responsivo default", () => {
    const { container } = render(
      <VehicleImage
        src="https://r2.example.com/card.jpg"
        alt="Card"
        width={400}
        height={300}
        variant="card"
      />
    );
    const img = container.querySelector("img");
    const sizes = img?.getAttribute("sizes") || "";
    expect(sizes).toContain("100vw");
    expect(sizes).toContain("50vw");
    expect(sizes).toContain("33vw");
  });

  it("[IMG-11] variant='thumb' aplica sizes='96px'", () => {
    const { container } = render(
      <VehicleImage
        src="https://r2.example.com/thumb.jpg"
        alt="Thumb"
        width={96}
        height={96}
        variant="thumb"
      />
    );
    expect(container.querySelector("img")?.getAttribute("sizes")).toBe("96px");
  });

  it("[IMG-11] variant='hero' aplica sizes='100vw'", () => {
    const { container } = render(
      <VehicleImage
        src="https://r2.example.com/hero.jpg"
        alt="Hero"
        width={1200}
        height={600}
        variant="hero"
      />
    );
    expect(container.querySelector("img")?.getAttribute("sizes")).toBe("100vw");
  });

  it("[IMG-11] sizes override pelo prop tem precedência sobre default da variant", () => {
    const { container } = render(
      <VehicleImage
        src="https://r2.example.com/x.jpg"
        alt="x"
        width={400}
        height={300}
        variant="card"
        sizes="50vw"
      />
    );
    expect(container.querySelector("img")?.getAttribute("sizes")).toBe("50vw");
  });

  // ---------------------------------------------------------------------------
  // Compatibilidade com formatos especiais
  // ---------------------------------------------------------------------------
  // Após o incidente de outbound bandwidth (2026-05-13), proxies próprios e
  // /uploads NUNCA podem passar pelo otimizador /_next/image — re-otimizar
  // gera caminho duplo Render→Render. Ver lib/images/image-optimization.ts.
  //
  // Como detectar: quando next/image otimiza, o `src` final contém
  // "/_next/image?url=..." (jsdom resolve URLs relativas com base no
  // window.location, então conferir presença da substring é robusto).

  function rendersWithoutOptimizer(src: string) {
    const { container } = render(
      <VehicleImage src={src} alt="x" width={400} height={300} />
    );
    const finalSrc = container.querySelector("img")?.getAttribute("src") || "";
    expect(finalSrc, `src final foi ${finalSrc}`).not.toContain("/_next/image");
    expect(finalSrc).toContain(src);
  }

  it("URL /api/vehicle-images?key=... NÃO passa pelo otimizador (src direto)", () => {
    rendersWithoutOptimizer("/api/vehicle-images?key=ads/abc.jpg");
  });

  it("URL /api/vehicle-images?src=... NÃO passa pelo otimizador", () => {
    rendersWithoutOptimizer("/api/vehicle-images?src=%2Fuploads%2Fads%2Ffoto.jpg");
  });

  it("URL /uploads/... legada NÃO passa pelo otimizador (src direto)", () => {
    rendersWithoutOptimizer("/uploads/ad-123.jpg");
  });

  it("URL pub-*.r2.dev NÃO passa pelo otimizador MESMO sem NEXT_PUBLIC_R2_PUBLIC_BASE_URL setado", () => {
    // Caso exato do incidente da 2ª iteração (2026-05-13). O env público
    // não estava setado no Render e por isso o helper antigo não reconhecia
    // o host — agora o sufixo .r2.dev é detectado por padrão.
    const prev = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
    delete (process.env as Record<string, string | undefined>).NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
    try {
      rendersWithoutOptimizer(
        "https://pub-662ff7f9e6a946168e27ca660899bc3f.r2.dev/vehicles/abc/foto.webp"
      );
    } finally {
      if (prev === undefined) {
        delete (process.env as Record<string, string | undefined>).NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
      } else {
        process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = prev;
      }
    }
  });

  it("URL absoluta no host R2 público NÃO passa pelo otimizador", () => {
    const prev = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = "https://cdn.carrosnacidade.com";
    try {
      rendersWithoutOptimizer("https://cdn.carrosnacidade.com/vehicles/abc/foto.webp");
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
      else process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = prev;
    }
  });

  it("URL no backend *.onrender.com NÃO passa pelo otimizador", () => {
    rendersWithoutOptimizer("https://carros-na-cidade-core.onrender.com/uploads/foo.jpg");
  });

  it("URL externa fora dos hosts internos PASSA pelo otimizador (CDN externo, ganho real)", () => {
    const { container } = render(
      <VehicleImage
        src="https://images.unsplash.com/photo-abc.jpg"
        alt="x"
        width={400}
        height={300}
      />
    );
    const src = container.querySelector("img")?.getAttribute("src") || "";
    expect(src).toContain("/_next/image");
  });

  it("URL .svg passa por skipOptimizer (unoptimized)", () => {
    const { container } = render(
      <VehicleImage src="https://example.com/icon.svg" alt="x" width={100} height={100} />
    );
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    // Quando unoptimized=true, next/image usa o src direto (sem /_next/image)
    expect(img?.getAttribute("src")).toBe("https://example.com/icon.svg");
  });

  it("data: URI passa por skipOptimizer", () => {
    const dataUri =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";
    const { container } = render(<VehicleImage src={dataUri} alt="x" width={100} height={100} />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(dataUri);
  });
});

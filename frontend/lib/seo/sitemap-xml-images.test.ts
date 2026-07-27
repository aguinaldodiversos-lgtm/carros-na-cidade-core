import { describe, expect, it } from "vitest";

import { buildSitemapXml } from "./sitemap-xml";
import type { PublicSitemapEntry } from "./sitemap-client";

/**
 * `<image:image>` aninhado no sitemap de páginas (2026-07-26).
 *
 * `buildSitemapXml` é COMPARTILHADO pelos 10 sitemaps. O `vehicles.xml` acabou
 * de entrar em produção e está sendo processado — a maior parte destes testes
 * existe para provar que os outros nove continuam byte-a-byte iguais.
 */

const IMG = "https://img.carrosnacidade.com/vehicles/publish-122-abc/original/2026/07";

function entry(over: Partial<PublicSitemapEntry> = {}): PublicSitemapEntry {
  return { loc: "/veiculo/fiat-pulse-2024-123", lastmod: "2026-07-26T15:33:24.458Z", ...over };
}

describe("buildSitemapXml — imagens aninhadas", () => {
  it("declara o namespace image QUANDO há imagem", () => {
    const xml = buildSitemapXml([entry({ images: [`${IMG}/capa.webp`] })]);
    expect(xml).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
  });

  it("NÃO declara o namespace quando nenhuma entrada tem imagem", () => {
    // Protege os outros 9 sitemaps: sem imagem, o XML tem que sair idêntico ao
    // que sempre saiu.
    const xml = buildSitemapXml([entry(), { loc: "/carros-em/atibaia-sp" }]);
    expect(xml).not.toContain("xmlns:image");
    expect(xml).not.toContain("<image:");
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  });

  it("aninha as imagens DENTRO do <url> correspondente, na ordem recebida", () => {
    const xml = buildSitemapXml([
      entry({ images: [`${IMG}/1-capa.webp`, `${IMG}/2.webp`, `${IMG}/3.webp`] }),
    ]);

    // `[\s\S]` em vez do flag `s` — o target do tsconfig é anterior a es2018.
    const bloco = xml.match(/<url>[\s\S]*?<\/url>/)?.[0] ?? "";
    const locs = [...bloco.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map((m) => m[1]);

    expect(locs).toEqual([`${IMG}/1-capa.webp`, `${IMG}/2.webp`, `${IMG}/3.webp`]);
    // A capa é a primeira — o Google usa a primeira como a mais representativa.
    expect(locs[0]).toContain("1-capa");
  });

  it("cada imagem vira <image:image><image:loc> e nada além disso", () => {
    const xml = buildSitemapXml([entry({ images: [`${IMG}/capa.webp`] })]);
    expect(xml).toContain(`<image:image><image:loc>${IMG}/capa.webp</image:loc></image:image>`);
    // Tags descontinuadas pelo Google — não emitir.
    for (const tag of ["image:caption", "image:title", "image:geo_location", "image:license"]) {
      expect(xml, `${tag} foi descontinuada e é ignorada — não emitir`).not.toContain(tag);
    }
  });

  it("anúncio sem imagem não emite tag alguma (XML continua válido)", () => {
    const xml = buildSitemapXml([entry({ images: [] }), entry({ loc: "/veiculo/b" })]);
    expect(xml).not.toContain("<image:");
    expect(xml.match(/<url>/g)).toHaveLength(2);
  });

  it("mistura: só o <url> com imagem recebe as tags", () => {
    const xml = buildSitemapXml([
      entry({ loc: "/veiculo/com-foto", images: [`${IMG}/x.webp`] }),
      entry({ loc: "/veiculo/sem-foto" }),
    ]);

    const blocos = [...xml.matchAll(/<url>[\s\S]*?<\/url>/g)].map((m) => m[0]);
    expect(blocos).toHaveLength(2);
    expect(blocos[0]).toContain("<image:loc>");
    expect(blocos[1]).not.toContain("<image:loc>");
  });

  it("escapa & na URL da imagem (XML inválido se não escapar)", () => {
    const xml = buildSitemapXml([entry({ images: [`${IMG}/foto.webp?a=1&b=2`] })]);
    expect(xml).toContain("<image:loc>" + `${IMG}/foto.webp?a=1&amp;b=2` + "</image:loc>");
    // Nenhum & solto: todo & tem que estar escapado.
    expect(xml.match(/&(?!amp;|quot;|apos;|lt;|gt;)/g)).toBeNull();
  });

  it("lastmod da página é preservado ao lado das imagens", () => {
    const xml = buildSitemapXml([entry({ images: [`${IMG}/x.webp`] })]);
    expect(xml).toContain("<lastmod>2026-07-26T15:33:24.458Z</lastmod>");
  });

  it("descarta item não-string sem quebrar o XML", () => {
    const xml = buildSitemapXml([entry({ images: [`${IMG}/ok.webp`, "", "   "] as string[] })]);
    expect(xml.match(/<image:image>/g)).toHaveLength(1);
  });
});

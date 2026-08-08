import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";

/**
 * `/anuncios` — ALIAS LEGADO da listagem. Só redireciona.
 *
 * ── A cadeia que existia ─────────────────────────────────────────────────────
 *   /anuncios  → 200, canonical /comprar
 *   /comprar   → não era destino final (redirector), sem canonical própria
 *              → o crawler acabava associando o conjunto à canonical da home
 *
 * Três URLs para chegar a lugar nenhum, e `/anuncios` ainda constava do
 * sitemap. Canonical apontando para uma rota que redireciona é um sinal
 * contraditório: diz "o conteúdo verdadeiro está ali" sobre um endereço que
 * responde "o conteúdo verdadeiro está em outro lugar".
 *
 * Agora `/comprar` é vitrine nacional real (200, autocanônica) e este alias é
 * um 308 direto para ela — um salto, destino final. O status HTTP real sai do
 * `middleware.ts` (`decideAnunciosListRedirect`), antes de qualquer HTML; este
 * arquivo é defesa em profundidade.
 *
 * A rota saiu do sitemap na mesma correção (`lib/seo/sitemap-static.ts`).
 */

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    alternates: { canonical: "/comprar" },
    robots: { index: false, follow: true },
  };
}

export default async function AnunciosLegacyRedirect() {
  permanentRedirect("/comprar");
}

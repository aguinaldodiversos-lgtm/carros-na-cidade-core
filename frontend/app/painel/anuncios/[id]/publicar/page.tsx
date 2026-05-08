/**
 * Rota legada — renomeada para `/painel/anuncios/[id]/upgrade`.
 *
 * O anúncio já chega `active` na criação (ver
 * `src/modules/ads/ads.create.pipeline.service.createAdNormalized`); esta
 * tela nunca publicou nada — sempre foi upsell pós-publicação. O nome
 * "publicar" foi descartado por induzir a erro.
 *
 * Redirect primário: `frontend/middleware.ts` faz 301 em
 * `/painel/anuncios/:id/publicar` → `/upgrade` antes de chegar aqui.
 * Esta página existe como segunda linha de defesa (ex: matcher fora de
 * sincronia, dev server, prerender legado).
 */
import { redirect, permanentRedirect } from "next/navigation";

type PageProps = {
  params: { id: string };
};

export const dynamic = "force-dynamic";

export default function PublicarAnuncioLegacyPage({ params }: PageProps) {
  // permanentRedirect = 308 (sinaliza ao cliente para reenviar com mesmo
  // método); para navegação GET o efeito ao usuário é o mesmo de 301.
  // O middleware ainda emite 301 puro — esta linha é fallback.
  if (typeof permanentRedirect === "function") {
    permanentRedirect(`/painel/anuncios/${params.id}/upgrade`);
  }
  redirect(`/painel/anuncios/${params.id}/upgrade`);
}

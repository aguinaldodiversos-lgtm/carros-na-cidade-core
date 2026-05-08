/**
 * Tela operacional pós-criação (Fase 4 — renomeada de "publicar").
 *
 * Rota canônica: `/painel/anuncios/[id]/upgrade`.
 *
 * O anúncio JÁ chega nesta tela em status `active` (ver
 * `ads.create.pipeline.service.createAdNormalized`). Esta tela NÃO publica
 * nada — ela é o ponto operacional de:
 *   • upgrade de plano (Start/Pro)
 *   • Destaque 7 dias (boost avulso)
 *   • upsell pós-publicação em geral
 *
 * Por isso o nome "publicar" foi descartado: induzia desenvolvedores e
 * usuários a achar que o ad ainda não estava no ar. A rota antiga
 * `/painel/anuncios/[id]/publicar` redireciona 301 para esta via
 * `frontend/middleware.ts`.
 *
 * NÃO altera /planos, header/footer global, sitemap nem layout global.
 * NÃO inicia checkouts: o client só dispara MP após clique do usuário.
 */
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import PublicationPlanSelector from "@/components/painel/PublicationPlanSelector";
import { fetchOwnedAd } from "@/lib/account/backend-account";
import { ensureSessionWithFreshBackendTokens } from "@/lib/session/ensure-backend-session";
import { getSessionDataFromCookieStore } from "@/services/sessionService";

type PageProps = {
  params: { id: string };
};

export const metadata: Metadata = {
  title: "Upgrade e destaque do anúncio",
  description:
    "Tela operacional pós-publicação: faça upgrade do plano e contrate Destaque 7 dias para o seu anúncio.",
  // robots noindex — é tela operacional interna, não vai pra SEO.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function UpgradeAnuncioPage({ params }: PageProps) {
  const cookieStore = cookies();
  const raw = getSessionDataFromCookieStore(cookieStore, headers());
  if (!raw) {
    redirect(
      `/login?next=${encodeURIComponent(`/painel/anuncios/${params.id}/upgrade`)}`
    );
  }

  if (!raw.accessToken && !raw.refreshToken) {
    redirect(raw.type === "CNPJ" ? "/dashboard-loja" : "/dashboard");
  }

  const ensured = await ensureSessionWithFreshBackendTokens(raw);
  if (!ensured.ok) {
    redirect(
      `/login?next=${encodeURIComponent(`/painel/anuncios/${params.id}/upgrade`)}`
    );
  }
  const session = ensured.session;

  // fetchOwnedAd valida ownership no backend (JOIN advertisers + adv.user_id).
  // 404 → ad não pertence ao user (ou inexiste). Tratamos como notFound()
  // para não vazar a existência do anúncio nem renderizar shell para id alheio.
  let owned: Awaited<ReturnType<typeof fetchOwnedAd>> | null = null;
  try {
    owned = await fetchOwnedAd(session, params.id);
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 404) {
      notFound();
    }
    owned = null;
  }

  const summary = owned
    ? {
        id: owned.ad.id,
        title: owned.ad.title,
        price: owned.ad.price,
        image_url: owned.ad.image_url,
      }
    : null;

  return (
    <main className="min-h-screen bg-cnc-bg">
      <PublicationPlanSelector adId={params.id} adSummary={summary} />
    </main>
  );
}

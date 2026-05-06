/**
 * Tela interna pós-revisão (Fase 4).
 *
 * Rota dedicada `/painel/anuncios/[id]/publicar` — operacional, NÃO é
 * landing pública e NÃO substitui /planos. Server component que faz:
 *   1. valida sessão (redireciona /login se não autenticado);
 *   2. busca o anúncio para compor o card-resumo (foto, preço, cidade);
 *   3. delega para o client `PublicationPlanSelector` que consulta
 *      GET /api/ads/:id/publication-options e renderiza ações.
 *
 * NÃO altera /planos, header/footer global, sitemap nem layout global.
 * NÃO inicia checkouts: o client só dispara MP após clique do usuário.
 */
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import PublicationPlanSelector from "@/components/painel/PublicationPlanSelector";
import { fetchOwnedAd } from "@/lib/account/backend-account";
import { ensureSessionWithFreshBackendTokens } from "@/lib/session/ensure-backend-session";
import { getSessionDataFromCookieStore } from "@/services/sessionService";

type PageProps = {
  params: { id: string };
};

export const metadata: Metadata = {
  title: "Revisão final e publicação",
  description:
    "Tela interna pós-revisão do anúncio: escolha como publicar e, se quiser, comprar Destaque 7 dias.",
  // robots noindex — é tela operacional interna, não vai pra SEO.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PublicarAnuncioPage({ params }: PageProps) {
  const cookieStore = cookies();
  const raw = getSessionDataFromCookieStore(cookieStore, headers());
  if (!raw) {
    redirect(
      `/login?next=${encodeURIComponent(`/painel/anuncios/${params.id}/publicar`)}`
    );
  }

  if (!raw.accessToken && !raw.refreshToken) {
    redirect(raw.type === "CNPJ" ? "/dashboard-loja" : "/dashboard");
  }

  const ensured = await ensureSessionWithFreshBackendTokens(raw);
  if (!ensured.ok) {
    redirect(
      `/login?next=${encodeURIComponent(`/painel/anuncios/${params.id}/publicar`)}`
    );
  }
  const session = ensured.session;

  let owned: Awaited<ReturnType<typeof fetchOwnedAd>> | null = null;
  try {
    owned = await fetchOwnedAd(session, params.id);
  } catch {
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

/**
 * Tela interna de EDIÇÃO de anúncio (pessoa física e lojista/CNPJ).
 *
 * Rota canônica: `/painel/anuncios/[id]/editar` — vizinha de `/upgrade`, no
 * mesmo namespace operacional pós-publicação. O botão "Editar" do dashboard
 * (AdsPremiumList) aponta para cá.
 *
 * Carregamento: `fetchOwnedAd` (GET /api/account/ads/:id) valida ownership no
 * backend (JOIN advertisers + adv.user_id, igual para PF e CNPJ) e devolve o
 * objeto `editable` com os campos pré-preenchidos. 404 → o anúncio não é do
 * usuário (ou não existe) → notFound() (não vaza existência).
 *
 * Salvamento: o client (EditAdForm) faz PUT /api/ads/:id (BFF), que reaplica
 * ownership + status editável no backend. Campos estruturais
 * (marca/modelo/ano/cidade) NÃO são editáveis após a publicação e aparecem
 * read-only. Fotos são preservadas.
 *
 * NÃO altera layout global, header/footer, /planos nem SEO (noindex).
 */
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import EditAdForm from "@/components/painel/EditAdForm";
import { fetchOwnedAd } from "@/lib/account/backend-account";
import { ensureSessionWithFreshBackendTokens } from "@/lib/session/ensure-backend-session";
import { getSessionDataFromCookieStore } from "@/services/sessionService";

type PageProps = {
  params: { id: string };
};

export const metadata: Metadata = {
  title: "Editar anúncio",
  description: "Edite preço, título, descrição e quilometragem do seu anúncio.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EditarAnuncioPage({ params }: PageProps) {
  const editUrl = `/painel/anuncios/${params.id}/editar`;

  const cookieStore = cookies();
  const raw = getSessionDataFromCookieStore(cookieStore, headers());
  if (!raw) {
    redirect(`/login?next=${encodeURIComponent(editUrl)}`);
  }

  if (!raw.accessToken && !raw.refreshToken) {
    redirect(raw.type === "CNPJ" ? "/dashboard-loja" : "/dashboard");
  }

  const ensured = await ensureSessionWithFreshBackendTokens(raw);
  if (!ensured.ok) {
    redirect(`/login?next=${encodeURIComponent(editUrl)}`);
  }
  const session = ensured.session;

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

  if (!owned || !owned.ad) {
    notFound();
  }

  const ad = owned.ad;
  const editable = ad.editable ?? null;
  const dashboardHref =
    raw.type === "CNPJ" ? "/dashboard-loja/meus-anuncios" : "/dashboard/meus-anuncios";

  return (
    <main className="min-h-screen bg-cnc-bg">
      <EditAdForm
        adId={String(ad.id)}
        status={ad.status}
        imageUrl={ad.image_url}
        editable={editable}
        dashboardHref={dashboardHref}
      />
    </main>
  );
}

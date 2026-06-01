import type { Metadata } from "next";
import Link from "next/link";
import { requirePfDashboardSession } from "@/lib/account/dashboard-session";
import { fetchOwnedHistoryAds } from "@/lib/account/backend-account";
import type { DashboardAd } from "@/lib/dashboard-types";

/**
 * Histórico do anunciante — Fase 3.5.
 *
 * Lista anúncios encerrados/arquivados que NÃO aparecem em "Meus anúncios"
 * ativos (status='archived', 'sold' ou 'expired').
 *
 * NÃO permite editar/publicar diretamente — restauração de anúncios
 * arquivados é restrita ao admin nesta fase (ver
 * src/modules/admin/ads/admin-ads.service.js#restoreAd).
 */
export const metadata: Metadata = {
  title: "Histórico de anúncios",
  description: "Anúncios arquivados e encerrados — preservados para consulta.",
  alternates: { canonical: "/dashboard/meus-anuncios/historico" },
};

export const dynamic = "force-dynamic";

const STATUS_LABEL: Partial<Record<DashboardAd["status"], string>> = {
  archived: "Arquivado",
  sold: "Vendido",
  expired: "Expirado",
};

const STATUS_BADGE_CLASS: Partial<Record<DashboardAd["status"], string>> = {
  archived: "bg-slate-200 text-slate-700",
  sold: "bg-emerald-100 text-emerald-700",
  expired: "bg-amber-100 text-amber-700",
};

function fmtPrice(value: number) {
  try {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${value}`;
  }
}

export default async function HistoricoAnunciosPage() {
  const session = await requirePfDashboardSession();
  let ads: DashboardAd[] = [];
  try {
    const result = await fetchOwnedHistoryAds(session);
    ads = Array.isArray(result?.ads) ? result.ads : [];
  } catch {
    ads = [];
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6">
      <header className="space-y-1">
        <Link href="/dashboard/meus-anuncios" className="text-xs text-cnc-muted hover:underline">
          ← Meus anúncios
        </Link>
        <h1 className="text-lg font-bold text-cnc-text">Histórico</h1>
        <p className="text-xs text-cnc-muted">
          Anúncios arquivados, vendidos ou expirados. Preservados para consulta — não aparecem
          publicamente nem na sua listagem operacional. Para reativar um anúncio arquivado, fale
          com a equipe de moderação.
        </p>
      </header>

      {ads.length === 0 ? (
        <div className="rounded-xl border border-cnc-line bg-white p-8 text-center text-sm text-cnc-muted shadow-card">
          Você não tem nenhum anúncio no histórico.
        </div>
      ) : (
        <ul className="space-y-2">
          {ads.map((ad) => {
            const badgeClass =
              STATUS_BADGE_CLASS[ad.status] ?? "bg-cnc-bg text-cnc-muted";
            const label = STATUS_LABEL[ad.status] ?? ad.status;
            return (
              <li
                key={ad.id}
                className="flex items-start gap-3 rounded-xl border border-cnc-line bg-white p-3 shadow-card"
              >
                {ad.image_url ? (
                  <img
                    src={ad.image_url}
                    alt={ad.title}
                    className="h-16 w-24 flex-shrink-0 rounded-lg object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-16 w-24 flex-shrink-0 rounded-lg bg-cnc-bg" aria-hidden />
                )}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm text-cnc-text truncate">{ad.title}</span>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${badgeClass}`}
                    >
                      {label}
                    </span>
                  </div>
                  <p className="text-xs text-cnc-muted">{fmtPrice(ad.price)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

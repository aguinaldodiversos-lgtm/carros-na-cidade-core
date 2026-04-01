import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { fetchDashboard } from "@/lib/account/backend-account";
import {
  AUTH_COOKIE_NAME,
  getSessionDataFromCookieValue,
} from "@/services/sessionService";

export const metadata: Metadata = {
  title: "Meus anúncios | Dashboard",
  alternates: { canonical: "/dashboard/anuncios" },
};

export const dynamic = "force-dynamic";

function formatPrice(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v);
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-[#dcf5e8] text-[#1a7a45]",
    paused: "bg-[#fef3c7] text-[#92400e]",
  };
  const labels: Record<string, string> = {
    active: "Ativo",
    paused: "Pausado",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${styles[status] ?? "bg-[#f0f3fa] text-[#5f6982]"}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

export default async function DashboardAnunciosPage() {
  const cookieStore = cookies();
  const session = getSessionDataFromCookieValue(
    cookieStore.get(AUTH_COOKIE_NAME)?.value
  );

  if (!session?.id || !session.accessToken) {
    redirect("/login?next=%2Fdashboard%2Fanuncios");
  }

  let activeAds: Awaited<ReturnType<typeof fetchDashboard>>["active_ads"] = [];
  let pausedAds: Awaited<ReturnType<typeof fetchDashboard>>["paused_ads"] = [];

  try {
    const payload = await fetchDashboard(session);
    activeAds = payload.active_ads ?? [];
    pausedAds = payload.paused_ads ?? [];
  } catch {
    // Dashboard data unavailable — show empty state
  }

  const allAds = [...activeAds, ...pausedAds];

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <DashboardNav />

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[24px] font-extrabold text-[#1d2538]">Meus anúncios</h1>
            <p className="text-[14px] text-[#6b7488]">
              {allAds.length} anúncio{allAds.length !== 1 ? "s" : ""} no total
            </p>
          </div>
          <Link
            href="/anunciar/publicar"
            className="rounded-xl bg-[#0e62d8] px-5 py-2.5 text-[14px] font-bold text-white transition hover:bg-[#0b54be]"
          >
            + Novo anúncio
          </Link>
        </div>

        {allAds.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-[#d4daea] bg-white p-10 text-center">
            <p className="text-[15px] font-bold text-[#1d2538]">Nenhum anúncio publicado ainda</p>
            <p className="mt-1 text-[13px] text-[#6b7488]">
              Publique seu primeiro anúncio gratuitamente.
            </p>
            <Link
              href="/anunciar"
              className="mt-5 inline-flex items-center justify-center rounded-xl bg-[#0e62d8] px-6 py-3 text-[14px] font-bold text-white transition hover:bg-[#0b54be]"
            >
              Publicar anúncio
            </Link>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {allAds.map((ad) => (
              <div
                key={ad.id}
                className="flex items-center gap-4 rounded-2xl border border-[#dfe4ef] bg-white p-4 shadow-sm"
              >
                {ad.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ad.image_url}
                    alt={ad.title}
                    className="h-16 w-24 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-xl bg-[#f0f3fa] text-2xl">
                    🚗
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[15px] font-extrabold text-[#1d2538]">{ad.title}</h2>
                    <StatusBadge status={ad.status} />
                    {ad.is_featured && (
                      <span className="rounded-full bg-[#edf4ff] px-2 py-0.5 text-[11px] font-bold text-[#0e62d8]">
                        Destaque
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[13px] text-[#6b7488]">
                    {formatPrice(ad.price)} · {ad.views} visualizações
                  </p>
                </div>
                <Link
                  href={`/impulsionar/${ad.id}`}
                  className="shrink-0 rounded-xl border border-[#d4daea] px-3 py-2 text-[12px] font-bold text-[#5f6982] transition hover:border-[#0e62d8] hover:text-[#0e62d8]"
                >
                  Impulsionar
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

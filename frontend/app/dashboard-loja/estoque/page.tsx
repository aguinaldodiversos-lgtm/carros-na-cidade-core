import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DashboardLojaNav } from "@/components/dashboard/DashboardLojaNav";
import { fetchDashboard } from "@/lib/account/backend-account";
import {
  AUTH_COOKIE_NAME,
  getSessionDataFromCookieValue,
} from "@/services/sessionService";

export const metadata: Metadata = {
  title: "Estoque da loja | Dashboard Loja",
  alternates: { canonical: "/dashboard-loja/estoque" },
};

export const dynamic = "force-dynamic";

function formatPrice(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v);
}

export default async function DashboardLojaEstoquePage() {
  const cookieStore = cookies();
  const session = getSessionDataFromCookieValue(
    cookieStore.get(AUTH_COOKIE_NAME)?.value
  );

  if (!session?.id || !session.accessToken) {
    redirect("/login?next=%2Fdashboard-loja%2Festoque");
  }

  let activeAds: Awaited<ReturnType<typeof fetchDashboard>>["active_ads"] = [];
  let pausedAds: Awaited<ReturnType<typeof fetchDashboard>>["paused_ads"] = [];

  try {
    const payload = await fetchDashboard(session);
    activeAds = payload.active_ads ?? [];
    pausedAds = payload.paused_ads ?? [];
  } catch {
    // Unavailable
  }

  const allAds = [...activeAds, ...pausedAds];

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <DashboardLojaNav />
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[24px] font-extrabold text-[#1d2538]">Estoque da loja</h1>
            <p className="text-[14px] text-[#6b7488]">
              {allAds.length} veículo{allAds.length !== 1 ? "s" : ""} no estoque
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
            <div className="text-3xl">📦</div>
            <p className="mt-3 text-[15px] font-bold text-[#1d2538]">Estoque vazio</p>
            <p className="mt-1 text-[13px] text-[#6b7488]">Publique seus primeiros veículos.</p>
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
                  <img src={ad.image_url} alt={ad.title} className="h-16 w-24 shrink-0 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-xl bg-[#f0f3fa] text-2xl">🚗</div>
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="text-[14px] font-extrabold text-[#1d2538]">{ad.title}</h2>
                  <p className="mt-0.5 text-[13px] text-[#6b7488]">
                    {formatPrice(ad.price)} · {ad.views} visualizações ·{" "}
                    <span className={ad.status === "active" ? "text-[#1a7a45]" : "text-[#92400e]"}>
                      {ad.status === "active" ? "Ativo" : "Pausado"}
                    </span>
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

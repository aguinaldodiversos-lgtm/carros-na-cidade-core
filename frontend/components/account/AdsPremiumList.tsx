"use client";

import Image from "next/image";
import Link from "next/link";
import type { DashboardAd } from "@/lib/dashboard-types";

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function splitVehicleTitle(title: string) {
  const t = title.trim();
  const sep = t.split(/\s*[·|]\s*/);
  if (sep.length >= 2) {
    return { name: sep[0].trim(), version: sep.slice(1).join(" · ").trim() };
  }
  const dash = t.split(/\s+-\s+/);
  if (dash.length >= 2) {
    return { name: dash[0].trim(), version: dash.slice(1).join(" - ").trim() };
  }
  return { name: t, version: "" };
}

type AdsPremiumListProps = {
  ads: DashboardAd[];
  busyAdId: string | null;
  variant: "pf" | "lojista";
  onBoost: (ad: DashboardAd) => void;
  onToggleStatus: (ad: DashboardAd) => void;
};

export default function AdsPremiumList({
  ads,
  busyAdId,
  variant,
  onBoost,
  onToggleStatus,
}: AdsPremiumListProps) {
  const showMetrics = variant === "lojista";

  if (ads.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#cfd8e8] bg-white/80 py-16 text-center">
        <p className="text-base font-semibold text-[#4b5563]">Nenhum anúncio nesta lista.</p>
        <Link
          href="/anunciar/novo"
          className="mt-4 inline-flex items-center justify-center rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] px-6 py-3 text-sm font-bold text-white"
        >
          + Criar novo anúncio
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e5e9f2] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[#eef1f6] bg-[#fafbfc] text-xs font-bold uppercase tracking-wide text-[#6b7280]">
              <th className="px-4 py-3 font-semibold">Foto</th>
              <th className="px-4 py-3 font-semibold">Título</th>
              <th className="px-4 py-3 font-semibold">Local</th>
              <th className="px-4 py-3 font-semibold">Preço</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              {showMetrics && (
                <>
                  <th className="px-4 py-3 font-semibold">Visitas</th>
                  <th className="px-4 py-3 font-semibold">Leads</th>
                </>
              )}
              <th className="px-4 py-3 text-right font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {ads.map((ad) => {
              const { name, version } = splitVehicleTitle(ad.title);
              const isActive = ad.status === "active";
              const busy = busyAdId === ad.id;
              return (
                <tr
                  key={ad.id}
                  className="border-b border-[#f0f2f7] transition hover:bg-[#f8fafc] last:border-0"
                >
                  <td className="px-4 py-3 align-middle">
                    <div className="relative h-14 w-24 overflow-hidden rounded-lg bg-[#eef2f8]">
                      <Image
                        src={ad.image_url}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="96px"
                        unoptimized={!ad.image_url.startsWith("/")}
                      />
                    </div>
                  </td>
                  <td className="max-w-[280px] px-4 py-3 align-middle">
                    <p className="font-extrabold text-[#1d2538]">{name}</p>
                    {version ? <p className="mt-0.5 text-xs text-[#6b7280]">{version}</p> : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 align-middle text-[#5b6680]">—</td>
                  <td className="whitespace-nowrap px-4 py-3 align-middle font-extrabold text-[#0e62d8]">
                    {formatMoney(ad.price)}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    {isActive ? (
                      <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800">
                        Ativo
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                        Pausado
                      </span>
                    )}
                    {ad.is_featured ? (
                      <span className="ml-1 inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700">
                        Destaque
                      </span>
                    ) : null}
                  </td>
                  {showMetrics && (
                    <>
                      <td className="whitespace-nowrap px-4 py-3 align-middle text-[#374151]">
                        {ad.views.toLocaleString("pt-BR")}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 align-middle text-[#9ca3af]">—</td>
                    </>
                  )}
                  <td className="px-4 py-3 align-middle">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onBoost(ad)}
                        disabled={busy}
                        className="rounded-lg border border-[#cfe0fc] bg-[#f0f6ff] px-3 py-1.5 text-xs font-bold text-[#0e62d8] transition hover:bg-[#e4efff] disabled:opacity-50"
                      >
                        Impulsionar
                      </button>
                      <Link
                        href="/anunciar"
                        className="rounded-lg border border-[#e2e7f1] px-3 py-1.5 text-xs font-bold text-[#37425d] transition hover:bg-[#f8fafc]"
                      >
                        Editar
                      </Link>
                      <button
                        type="button"
                        onClick={() => onToggleStatus(ad)}
                        disabled={busy}
                        className="text-xs font-semibold text-[#6b7280] underline-offset-2 hover:underline disabled:opacity-50"
                      >
                        {isActive ? "Pausar" : "Ativar"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

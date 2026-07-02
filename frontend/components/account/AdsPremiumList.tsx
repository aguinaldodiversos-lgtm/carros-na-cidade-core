"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
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

type StatusFilter = "todos" | "ativos" | "pausados";
type OrderKey = "recentes" | "preco-desc" | "preco-asc";

type AdsPremiumListProps = {
  ads: DashboardAd[];
  busyAdId: string | null;
  variant: "pf" | "lojista";
  onBoost: (ad: DashboardAd) => void;
  onToggleStatus: (ad: DashboardAd) => void;
};

/** Ícone "i" com tooltip nativo (title) — usado nos cabeçalhos de métrica. */
function InfoIcon({ label }: { label: string }) {
  return (
    <svg
      className="ml-1 inline-block h-3.5 w-3.5 text-[#b6c0d4]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-label={label}
    >
      <title>{label}</title>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

export default function AdsPremiumList({
  ads,
  busyAdId,
  variant: _variant,
  onBoost,
  onToggleStatus,
}: AdsPremiumListProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [order, setOrder] = useState<OrderKey>("recentes");
  const [openKebab, setOpenKebab] = useState<string | null>(null);

  const visibleAds = useMemo(() => {
    let list = ads;
    if (statusFilter === "ativos") list = list.filter((a) => a.status === "active");
    else if (statusFilter === "pausados") list = list.filter((a) => a.status === "paused");

    const q = search.trim().toLowerCase();
    if (q) list = list.filter((a) => a.title.toLowerCase().includes(q));

    if (order === "preco-desc") list = [...list].sort((a, b) => b.price - a.price);
    else if (order === "preco-asc") list = [...list].sort((a, b) => a.price - b.price);
    // "recentes" = ordem que veio do backend (já ordena por atualização).

    return list;
  }, [ads, statusFilter, search, order]);

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e5e9f2] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
      {/* Toolbar: título + busca + filtros (mesmo card da tabela). */}
      <div className="flex flex-col gap-3 border-b border-[#eef1f6] p-4 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-lg font-extrabold text-[#0f172a]">Meus anúncios</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative">
            <span className="sr-only">Buscar anúncio</span>
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3-3" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar anúncio"
              className="h-9 w-full rounded-lg border border-[#e2e8f0] bg-white pl-9 pr-3 text-sm text-[#1d2538] outline-none placeholder:text-[#94a3b8] focus:border-[#0e62d8] sm:w-64"
              data-testid="ads-search"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-9 rounded-lg border border-[#e2e8f0] bg-white px-2 text-sm font-semibold text-[#64748b] outline-none focus:border-[#0e62d8]"
            data-testid="ads-status-filter"
            aria-label="Filtrar por status"
          >
            <option value="todos">Todos os status</option>
            <option value="ativos">Ativos</option>
            <option value="pausados">Pausados</option>
          </select>
          <select
            value={order}
            onChange={(e) => setOrder(e.target.value as OrderKey)}
            className="h-9 rounded-lg border border-[#e2e8f0] bg-white px-2 text-sm font-semibold text-[#64748b] outline-none focus:border-[#0e62d8]"
            data-testid="ads-order"
            aria-label="Ordenar"
          >
            <option value="recentes">Mais recentes</option>
            <option value="preco-desc">Maior preço</option>
            <option value="preco-asc">Menor preço</option>
          </select>
        </div>
      </div>

      {visibleAds.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-base font-semibold text-[#4b5563]">
            {ads.length === 0 ? "Nenhum anúncio nesta lista." : "Nenhum anúncio encontrado."}
          </p>
          <Link
            href="/anunciar/novo"
            className="mt-4 inline-flex items-center justify-center rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] px-6 py-3 text-sm font-bold text-white"
          >
            + Criar novo anúncio
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#eef1f6] bg-[#fafbfc] text-xs font-bold uppercase tracking-wide text-[#6b7280]">
                <th className="px-4 py-3 font-semibold">Anúncio</th>
                <th className="px-4 py-3 font-semibold">Preço</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">
                  Visitas
                  <InfoIcon label="Visitas acumuladas do anúncio (fonte: ad_metrics)" />
                </th>
                <th className="px-4 py-3 font-semibold">
                  Leads
                  <InfoIcon label="Contatos recebidos pelo anúncio (fonte: tabela leads)" />
                </th>
                <th className="px-4 py-3 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visibleAds.map((ad) => {
                const { name } = splitVehicleTitle(ad.title);
                const specs = [ad.year, ad.fuel_type, ad.transmission]
                  .filter(Boolean)
                  .join(" • ");
                const location = [ad.city, ad.state].filter(Boolean).join(" - ");
                const isActive = ad.status === "active";
                const busy = busyAdId === ad.id;
                return (
                  <tr
                    key={ad.id}
                    className="border-b border-[#f0f2f7] transition hover:bg-[#f8fafc] last:border-0"
                  >
                    {/* Coluna ANÚNCIO: foto + título juntos (specs/local exigem
                        campos que o payload ainda não traz — ver observação). */}
                    <td className="max-w-[340px] px-4 py-3 align-middle">
                      <div className="flex items-center gap-3">
                        <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-[#eef2f8]">
                          <Image
                            src={ad.image_url}
                            alt=""
                            fill
                            className="object-cover"
                            sizes="96px"
                            unoptimized={!ad.image_url.startsWith("/")}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-extrabold text-[#1d2538]">{name}</p>
                          {specs ? (
                            <p className="mt-0.5 truncate text-xs text-[#6b7280]">{specs}</p>
                          ) : null}
                          {location ? (
                            <p className="truncate text-xs text-[#94a3b8]">{location}</p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-middle font-extrabold text-[#0e62d8]">
                      {formatMoney(ad.price)}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Ativo
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
                    <td className="whitespace-nowrap px-4 py-3 align-middle text-[#374151]">
                      {ad.views.toLocaleString("pt-BR")}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-middle text-[#374151]">
                      {(ad.leads ?? 0).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onBoost(ad)}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#cfe0fc] bg-[#f0f6ff] px-3 py-1.5 text-xs font-bold text-[#0e62d8] transition hover:bg-[#e4efff] disabled:opacity-50"
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                            <path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M14 4s5 1 7 3-3 7-3 7l-6-1-4-4 1-6ZM9 15l-1-1" />
                          </svg>
                          Impulsionar
                        </button>
                        <Link
                          href={`/painel/anuncios/${ad.id}/editar`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#e2e7f1] px-3 py-1.5 text-xs font-bold text-[#37425d] transition hover:bg-[#f8fafc]"
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                            <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
                          </svg>
                          Editar
                        </Link>

                        {/* Menu kebab: Pausar/Ativar (substitui o link em texto). */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setOpenKebab((cur) => (cur === ad.id ? null : ad.id))}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#e2e7f1] text-[#6b7280] transition hover:bg-[#f8fafc]"
                            aria-haspopup="menu"
                            aria-expanded={openKebab === ad.id}
                            aria-label="Mais ações"
                            data-testid={`ad-kebab-${ad.id}`}
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                              <circle cx="12" cy="5" r="1.6" />
                              <circle cx="12" cy="12" r="1.6" />
                              <circle cx="12" cy="19" r="1.6" />
                            </svg>
                          </button>
                          {openKebab === ad.id ? (
                            <>
                              <button
                                type="button"
                                className="fixed inset-0 z-40 cursor-default"
                                aria-hidden
                                tabIndex={-1}
                                onClick={() => setOpenKebab(null)}
                              />
                              <div
                                role="menu"
                                className="absolute right-0 z-50 mt-1 w-40 overflow-hidden rounded-lg border border-[#e8ecf4] bg-white py-1 shadow-[0_12px_32px_rgba(11,22,44,0.16)]"
                              >
                                <button
                                  type="button"
                                  role="menuitem"
                                  disabled={busy}
                                  onClick={() => {
                                    setOpenKebab(null);
                                    onToggleStatus(ad);
                                  }}
                                  className="block w-full px-3 py-2 text-left text-sm font-semibold text-[#37425d] hover:bg-[#f8fafc] disabled:opacity-50"
                                >
                                  {isActive ? "Pausar anúncio" : "Ativar anúncio"}
                                </button>
                                <Link
                                  role="menuitem"
                                  href={`/painel/anuncios/${ad.id}/editar`}
                                  onClick={() => setOpenKebab(null)}
                                  className="block w-full px-3 py-2 text-left text-sm font-semibold text-[#37425d] hover:bg-[#f8fafc]"
                                >
                                  Editar anúncio
                                </Link>
                              </div>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

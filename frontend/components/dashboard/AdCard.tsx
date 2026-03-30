"use client";

import Image from "next/image";
import Link from "next/link";
import type { DashboardAd } from "@/lib/dashboard-types";

type AdCardProps = {
  ad: DashboardAd;
  busy?: boolean;
  onToggleStatus: (ad: DashboardAd) => void;
  onDelete: (ad: DashboardAd) => void;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "--";
  return new Date(value).toLocaleDateString("pt-BR");
}

function StatusBadge({ active, highlighted }: { active: boolean; highlighted: boolean }) {
  if (highlighted) {
    return (
      <span className="rounded-full bg-[#e43358] px-2.5 py-1 text-[11px] font-extrabold uppercase text-white">
        Destaque
      </span>
    );
  }
  if (active) {
    return (
      <span className="rounded-full bg-[#198754] px-2.5 py-1 text-[11px] font-extrabold uppercase text-white">
        Ativo
      </span>
    );
  }
  return (
    <span className="rounded-full bg-[#8f98af] px-2.5 py-1 text-[11px] font-extrabold uppercase text-white">
      Pausado
    </span>
  );
}

export default function AdCard({ ad, busy = false, onToggleStatus, onDelete }: AdCardProps) {
  const isActive = ad.status === "active";

  return (
    <article className="overflow-hidden rounded-2xl border border-[#dfe4ef] bg-white shadow-[0_3px_18px_rgba(10,20,40,0.07)]">
      <div className="relative h-[180px] w-full">
        <Image src={ad.image_url} alt={ad.title} fill className="object-cover" />
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="line-clamp-2 text-lg font-extrabold leading-tight text-[#1d2538]">
            {ad.title}
          </h3>
          <StatusBadge active={isActive} highlighted={ad.is_featured} />
        </div>

        <p className="text-2xl font-extrabold text-[#0e62d8]">{formatMoney(ad.price)}</p>

        <div className="grid gap-2 rounded-xl border border-[#e2e7f1] bg-[#f8fafe] p-3 text-sm text-[#4f5b76] sm:grid-cols-2">
          <p>
            <strong className="font-bold text-[#1f2c47]">Status:</strong>{" "}
            {isActive ? "Ativo" : "Pausado"}
          </p>
          <p>
            <strong className="font-bold text-[#1f2c47]">Visualizacoes:</strong>{" "}
            {ad.views.toLocaleString("pt-BR")}
          </p>
          <p>
            <strong className="font-bold text-[#1f2c47]">Expira em:</strong>{" "}
            {formatDate(ad.expires_at)}
          </p>
          <p>
            <strong className="font-bold text-[#1f2c47]">Destaque ate:</strong>{" "}
            {formatDate(ad.featured_until)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`/anunciar/editar/${ad.id}`}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[#d7ddea] text-sm font-bold text-[#34405e] transition hover:bg-[#f2f5fb]"
          >
            Editar
          </Link>
          <button
            type="button"
            onClick={() => onToggleStatus(ad)}
            disabled={busy}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[#d7ddea] text-sm font-bold text-[#34405e] transition hover:bg-[#f2f5fb] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isActive ? "Pausar" : "Ativar"}
          </button>
          <button
            type="button"
            onClick={() => onDelete(ad)}
            disabled={busy}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[#f4ced6] bg-[#fff4f6] text-sm font-bold text-[#bf2848] transition hover:bg-[#ffecef] disabled:cursor-not-allowed disabled:opacity-70"
          >
            Excluir
          </button>
          <Link
            href={`/impulsionar/${ad.id}`}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[linear-gradient(120deg,#f15a24_0%,#f1892f_100%)] text-sm font-bold text-white transition hover:brightness-110"
          >
            Impulsionar
          </Link>
        </div>
      </div>
    </article>
  );
}

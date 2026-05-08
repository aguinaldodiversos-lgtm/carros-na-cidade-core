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

type BadgeVariant = "active" | "paused" | "highlighted" | "pending_review" | "rejected" | "sold" | "expired" | "blocked";

const BADGE_STYLE: Record<BadgeVariant, { bg: string; label: string }> = {
  highlighted: { bg: "#e43358", label: "Destaque" },
  active: { bg: "#198754", label: "Ativo" },
  pending_review: { bg: "#d97706", label: "Em análise" },
  rejected: { bg: "#b91c1c", label: "Rejeitado" },
  paused: { bg: "#8f98af", label: "Pausado" },
  sold: { bg: "#475569", label: "Vendido" },
  expired: { bg: "#6b7280", label: "Expirado" },
  blocked: { bg: "#7f1d1d", label: "Bloqueado" },
};

function resolveBadgeVariant(status: string, highlighted: boolean): BadgeVariant {
  // Em análise ou rejeitado são prioritários — não exibir "Destaque"
  // sobre um anúncio que ainda está em moderação.
  if (status === "pending_review") return "pending_review";
  if (status === "rejected") return "rejected";
  if (status === "blocked") return "blocked";
  if (status === "sold") return "sold";
  if (status === "expired") return "expired";
  if (highlighted && status === "active") return "highlighted";
  if (status === "active") return "active";
  return "paused";
}

function StatusBadge({
  status,
  highlighted,
}: {
  status: string;
  highlighted: boolean;
}) {
  const variant = resolveBadgeVariant(status, highlighted);
  const cfg = BADGE_STYLE[variant];
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase text-white"
      style={{ background: cfg.bg }}
    >
      {cfg.label}
    </span>
  );
}

export default function AdCard({ ad, busy = false, onToggleStatus, onDelete }: AdCardProps) {
  const isActive = ad.status === "active";
  const isPausedish = ad.status === "paused";
  const isModeration = ad.status === "pending_review" || ad.status === "rejected";
  const moderationMessage =
    ad.status === "rejected"
      ? "Este anúncio foi rejeitado. Verifique os dados ou entre em contato com o suporte."
      : ad.status === "pending_review"
        ? "Este anúncio está em análise de segurança. Assim que aprovado, ele aparecerá no portal."
        : null;

  return (
    <article className="overflow-hidden rounded-2xl border border-[#dfe4ef] bg-white shadow-[0_3px_18px_rgba(10,20,40,0.07)]">
      <div className="relative h-[180px] w-full">
        <Image
          src={ad.image_url}
          alt={ad.title}
          fill
          className="object-cover"
          unoptimized={!ad.image_url.startsWith("/")}
        />
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="line-clamp-2 text-lg font-extrabold leading-tight text-[#1d2538]">
            {ad.title}
          </h3>
          <StatusBadge status={ad.status} highlighted={ad.is_featured} />
        </div>

        <p className="text-2xl font-extrabold text-[#0e62d8]">{formatMoney(ad.price)}</p>

        {moderationMessage && (
          <p
            role="status"
            className="rounded-xl border border-[#f4dca8] bg-[#fff8e6] p-3 text-sm text-[#7c5b00]"
          >
            {moderationMessage}
          </p>
        )}

        <div className="grid gap-2 rounded-xl border border-[#e2e7f1] bg-[#f8fafe] p-3 text-sm text-[#4f5b76] sm:grid-cols-2">
          <p>
            <strong className="font-bold text-[#1f2c47]">Status:</strong>{" "}
            {BADGE_STYLE[resolveBadgeVariant(ad.status, ad.is_featured)].label}
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
            disabled={busy || isModeration}
            title={
              isModeration
                ? "Anúncios em análise ou rejeitados não podem ser pausados/ativados."
                : undefined
            }
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[#d7ddea] text-sm font-bold text-[#34405e] transition hover:bg-[#f2f5fb] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isActive ? "Pausar" : isPausedish ? "Ativar" : "Aguardando"}
          </button>
          <button
            type="button"
            onClick={() => onDelete(ad)}
            disabled={busy}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[#f4ced6] bg-[#fff4f6] text-sm font-bold text-[#bf2848] transition hover:bg-[#ffecef] disabled:cursor-not-allowed disabled:opacity-70"
          >
            Excluir
          </button>
          {isActive ? (
            <Link
              href={`/impulsionar/${ad.id}`}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[linear-gradient(120deg,#f15a24_0%,#f1892f_100%)] text-sm font-bold text-white transition hover:brightness-110"
            >
              Impulsionar
            </Link>
          ) : (
            <button
              type="button"
              disabled
              title="Apenas anúncios ativos podem receber destaque."
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[#cbd5e1] text-sm font-bold text-white opacity-70"
            >
              Impulsionar
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

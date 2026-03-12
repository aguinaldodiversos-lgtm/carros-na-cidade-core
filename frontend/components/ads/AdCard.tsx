"use client";

import Image from "next/image";
import Link from "next/link";
import type { AdItem } from "@/lib/search/ads-search";
import { trackAdEvent } from "@/lib/analytics/public-events";

interface AdCardProps {
  item: AdItem;
  priority?: boolean;
  variant?: "default" | "home";
}

function formatPrice(price?: number) {
  if (!price || Number(price) <= 0) return "Consulte";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatMileage(value?: number) {
  if (!value || Number(value) <= 0) return "Km não informado";
  return `${Number(value).toLocaleString("pt-BR")} km`;
}

function resolveImage(item: AdItem) {
  if (item.image_url) return item.image_url;
  if (Array.isArray(item.images) && item.images.length > 0) return item.images[0];
  return "/images/hero.jpeg";
}

function resolveDetailSlug(item: AdItem) {
  return item.slug?.trim() || String(item.id);
}

function resolveAdHref(item: AdItem) {
  return `/veiculo/${resolveDetailSlug(item)}`;
}

function buildTitle(item: AdItem) {
  if (item.title?.trim()) return item.title.trim();
  return [item.year, item.brand, item.model].filter(Boolean).join(" ") || "Veículo";
}

function normalizePlanLabel(plan?: string | null) {
  const normalized = String(plan ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "free") return null;
  if (normalized === "essential") return "Loja verificada";
  if (normalized === "premium") return "Destaque";
  return null;
}

function FavoriteIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M12 20.5s-7.25-4.35-7.25-10.1a4.2 4.2 0 0 1 7.25-2.7 4.2 4.2 0 0 1 7.25 2.7c0 5.75-7.25 10.1-7.25 10.1Z" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M12 21s-6-5.5-6-10a6 6 0 1 1 12 0c0 4.5-6 10-6 10Z" />
      <circle cx="12" cy="11" r="2.25" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

function GaugeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M4 15a8 8 0 1 1 16 0" />
      <path d="M12 12l4-2" />
      <path d="M12 15h.01" />
    </svg>
  );
}

export function AdCard({ item, priority = false, variant = "default" }: AdCardProps) {
  const image = resolveImage(item);
  const href = resolveAdHref(item);
  const title = buildTitle(item);
  const location = [item.city, item.state].filter(Boolean).join(" - ");
  const hasBelowFipe = item.below_fipe === true;
  const hasHighlight = Boolean(item.highlight_until);
  const detailSlug = resolveDetailSlug(item);
  const isHome = variant === "home";
  const cleanPlanLabel = normalizePlanLabel(item.plan);
  const infoItems = [
    item.year
      ? {
          key: "year",
          label: String(item.year),
          icon: <CalendarIcon />,
        }
      : null,
    {
      key: "mileage",
      label: formatMileage(item.mileage),
      icon: <GaugeIcon />,
    },
    cleanPlanLabel
      ? {
          key: "plan",
          label: cleanPlanLabel,
          icon: null,
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
  }>;

  return (
    <article
      className={`h-full overflow-hidden border bg-white transition duration-300 hover:-translate-y-1 ${
        isHome
          ? "rounded-[10px] border-[#e1e5ef] shadow-[0_2px_18px_rgba(20,30,60,0.06)] hover:shadow-[0_8px_22px_rgba(20,30,60,0.10)]"
          : "rounded-[24px] border-[#dbe4f0] shadow-[0_14px_36px_rgba(15,23,42,0.08)] hover:shadow-[0_22px_48px_rgba(15,23,42,0.14)]"
      }`}
    >
      <Link
        href={href}
        aria-label={`Ver detalhes de ${title}`}
        onClick={() => trackAdEvent(item.id, "click")}
        className="group flex h-full flex-col"
      >
        <div className={`relative overflow-hidden bg-[#edf2f8] ${isHome ? "aspect-[1.36/1]" : "aspect-[16/10]"}`}>
          <Image
            src={image}
            alt={title}
            fill
            priority={priority}
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
            className="object-cover transition duration-500 group-hover:scale-[1.04]"
          />

          <div className="absolute inset-0 bg-gradient-to-t from-[#09111f]/58 via-transparent to-transparent" />

          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            {isHome && hasBelowFipe ? (
              <span className="rounded-[7px] bg-[#1f74e8] px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-white shadow-sm">
                {formatPrice(item.price)}
              </span>
            ) : hasHighlight ? (
              <span
                className={`px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-white shadow-sm ${
                  isHome ? "rounded-[7px] bg-[#1f74e8]" : "rounded-full bg-[#0a7c83]"
                }`}
              >
                {isHome ? "Patrocinado" : "Destaque"}
              </span>
            ) : null}

            {hasBelowFipe && !isHome ? (
              <span
                className={`px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-white shadow-sm ${
                  isHome ? "rounded-[7px] bg-[#0e62d8]" : "rounded-full bg-[#0e62d8]"
                }`}
              >
                {isHome ? "Oferta" : "Abaixo da FIPE"}
              </span>
            ) : null}
          </div>

          <span
            className={`absolute right-3 top-3 inline-flex items-center justify-center bg-white/92 text-[#455066] shadow-sm backdrop-blur ${
              isHome ? "h-7 w-7 rounded-full" : "h-9 w-9 rounded-full"
            }`}
          >
            <FavoriteIcon />
          </span>

          {isHome ? null : (
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 px-4 pb-4">
              <div className="rounded-full bg-white/92 px-3 py-1 text-[11px] font-bold text-[#1d2538] shadow-sm backdrop-blur">
                ID {detailSlug}
              </div>
              <div className="rounded-full bg-[#081120]/72 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
                Ver veículo
              </div>
            </div>
          )}
        </div>

        <div className={`flex flex-1 flex-col ${isHome ? "p-2.5" : "p-5"}`}>
          {isHome ? null : (
            <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#0e62d8]">
              Anúncio premium
            </div>
          )}

          <h3
            className={`line-clamp-2 font-black text-[#162033] ${
              isHome ? "min-h-[2.6rem] text-[16px] leading-5" : "mt-2 min-h-[3.25rem] text-[19px] leading-6"
            }`}
          >
            {title}
          </h3>

          {isHome ? null : (
            <div className="mt-3 inline-flex items-center gap-2 text-sm text-[#5f6982]">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#eef4ff] text-[#0e62d8]">
                <LocationIcon />
              </span>
              <span>{location || "Localização não informada"}</span>
            </div>
          )}

          {isHome ? (
            <>
              <div className="mt-1.5 text-[12px] text-[#616c81]">
                {location || "Localização não informada"}
              </div>

              <div className="mt-2 flex items-end justify-between gap-2">
                <div className="text-[14px] font-black leading-none tracking-[-0.03em] text-[#0e62d8] md:text-[16px]">
                  {formatPrice(item.price)}
                </div>
                <div className="flex items-center gap-1.5">
                  {cleanPlanLabel ? (
                    <span className="rounded-[6px] bg-[#eaf2ff] px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-[#0e62d8]">
                      {cleanPlanLabel}
                    </span>
                  ) : null}
                  {hasBelowFipe ? (
                    <span className="rounded-[6px] bg-[#eaf2ff] px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-[#0e62d8]">
                      Abaixo da FIPE
                    </span>
                  ) : null}
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#f2f6fd] text-[#0e62d8] transition group-hover:bg-[#0e62d8] group-hover:text-white">
                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
                      <path d="M7 4 13 10 7 16" />
                    </svg>
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                {infoItems.map((info) => (
                  <span
                    key={info.key}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#d9e3f0] bg-[#f8fbff] px-3 py-1.5 text-[12px] font-semibold text-[#42506a]"
                  >
                    {info.icon}
                    {info.label}
                  </span>
                ))}
              </div>

              <div className="mt-5 rounded-[20px] border border-[#e3ebf5] bg-[#f8fbff] p-4">
                <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#6a7488]">
                  Valor do anúncio
                </div>
                <div className="mt-1 text-[28px] font-black tracking-[-0.03em] text-[#0e62d8]">
                  {formatPrice(item.price)}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {hasBelowFipe ? (
                    <span className="rounded-full bg-[#eaf2ff] px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#0e62d8]">
                      Oferta
                    </span>
                  ) : null}
                  {hasHighlight ? (
                    <span className="rounded-full bg-[#e8fbfb] px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#0a7c83]">
                      Visibilidade alta
                    </span>
                  ) : null}
                </div>
              </div>

              <span className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#0e62d8] px-4 text-[16px] font-bold text-white transition group-hover:bg-[#0c54bc]">
                Ver detalhes do veículo
              </span>
            </>
          )}
        </div>
      </Link>
    </article>
  );
}

import Link from "next/link";
import type { AdItem } from "@/lib/search/ads-search";
import { buildAdHref } from "@/lib/ads/build-ad-href";

export type CatalogItem = AdItem & {
  title?: string;
  brand?: string;
  model?: string;
  version?: string;
  year?: number | string;
  year_model?: string | null;
  yearLabel?: string | null;
  mileage?: number | string;
  transmission?: string;
  fuel_type?: string;
  city?: string;
  state?: string;
  price?: number | string;
  image_url?: string | null;
  image?: string | null;
  cover_image?: string | null;
  images?: string[] | null;
  slug?: string;
  below_fipe?: boolean;
  highlight_until?: string | null;
  plan?: string | null;
  seller_type?: string | null;
  dealer_name?: string | null;
  dealership_name?: string | null;
  dealership_id?: number | null;
  created_at?: string | null;
  catalogWeight?: 1 | 2 | 3 | 4;
};

interface CatalogVehicleCardProps {
  item: CatalogItem;
  featured?: boolean;
  weight: 1 | 2 | 3 | 4;
  linkMode?: "self" | "none";
  hrefOverride?: string;
  className?: string;
}

const FALLBACK_IMAGE = "/images/vehicle-placeholder.svg";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function toText(value: unknown, fallback = "") {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function parseMoney(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === "") return 0;

  const normalized = String(value)
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  if (!value) return "R$ 0";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function parseMileage(value?: number | string | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === "") return 0;

  const cleaned = String(value).replace(/[^\d]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMileage(value?: number | string | null) {
  const parsed = parseMileage(value);
  if (!parsed) return null;
  return `${parsed.toLocaleString("pt-BR")} km`;
}

function extractPrimaryYear(item: CatalogItem) {
  const candidates = [item.year, item.yearLabel, item.year_model];

  for (const candidate of candidates) {
    const text = toText(candidate);
    if (!text) continue;

    const match = text.match(/\d{4}/);
    if (match) return match[0];
  }

  return "";
}

function getImage(item: CatalogItem) {
  const directCandidates = [item.image_url, item.image, item.cover_image];

  for (const candidate of directCandidates) {
    const text = toText(candidate);
    if (text) return text;
  }

  if (Array.isArray(item.images)) {
    const firstValidImage = item.images.find(
      (image) => typeof image === "string" && image.trim().length > 0
    );
    if (firstValidImage) return firstValidImage;
  }

  return FALLBACK_IMAGE;
}

function getTitle(item: CatalogItem) {
  const explicitTitle = toText(item.title);
  if (explicitTitle) return explicitTitle;

  const year = extractPrimaryYear(item);
  const pieces = [year, toText(item.brand), toText(item.model), toText(item.version)].filter(
    Boolean
  );

  return pieces.join(" ") || "Veículo";
}

function getHref(item: CatalogItem, resolvedTitle: string) {
  return buildAdHref({
    id: item.id,
    slug: item.slug || undefined,
    title: resolvedTitle,
    brand: item.brand || undefined,
    model: item.model || undefined,
    version: item.version || undefined,
    year: item.year || item.year_model || item.yearLabel || undefined,
  });
}

function getMetaLine(item: CatalogItem) {
  const pieces = [
    toText(item.fuel_type),
    formatMileage(item.mileage),
    toText(item.transmission),
  ].filter(Boolean);

  if (pieces.length > 0) return pieces.join("  •  ");
  return "Informações sob consulta";
}

function getLocation(item: CatalogItem) {
  const city = toText(item.city, "São Paulo");
  const state = toText(item.state, "SP").toUpperCase();
  return `${city} - ${state}`;
}

/** Texto curto para data de publicação quando a API envia created_at. */
function getListedHint(createdAt?: string | null) {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (!Number.isFinite(d.getTime())) return null;

  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / 86_400_000);

  if (days < 1) return "Publicado hoje";
  if (days === 1) return "Publicado há 1 dia";
  if (days < 7) return `Publicado há ${days} dias`;
  if (days < 30) return `Publicado há ${Math.floor(days / 7)} semanas`;
  return `Desde ${d.toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}`;
}

function getBadge(weight: 1 | 2 | 3 | 4) {
  if (weight === 4) {
    return {
      label: "Destaque",
      className: "bg-cyan-600 text-white",
    };
  }

  if (weight === 3) {
    return {
      label: "Loja Premium",
      className: "bg-blue-800 text-white",
    };
  }

  if (weight === 2) {
    return {
      label: "Loja",
      className: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
    };
  }

  return {
    label: "Anúncio",
    className: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  };
}

function getFinanceChip(weight: 1 | 2 | 3 | 4, item: CatalogItem) {
  if (item.below_fipe) return "Abaixo da FIPE";
  if (weight === 4) return "Mais visibilidade";
  if (weight === 3) return "Revenda premium";
  if (weight === 2) return "Loja verificada";
  return "Oferta local";
}

export default function CatalogVehicleCard({
  item,
  featured = false,
  weight,
  linkMode = "self",
  hrefOverride,
  className = "",
}: CatalogVehicleCardProps) {
  const title = getTitle(item);
  const href = hrefOverride || getHref(item, title);
  const price = parseMoney(item.price);
  const location = getLocation(item);
  const meta = getMetaLine(item);
  const badge = getBadge(weight);
  const financeChip = getFinanceChip(weight, item);
  const image = getImage(item);
  const listedHint = getListedHint(item.created_at);

  const cardClasses = cx(
    "group overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md",
    featured ? "rounded-xl" : "rounded-lg",
    className
  );

  const content = (
    <>
      <div
        className={cx(
          "relative overflow-hidden",
          featured ? "aspect-[1.33/0.83]" : "aspect-[1.18/0.84]"
        )}
      >
        <img
          src={image}
          alt={title}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          loading="lazy"
        />

        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <span
            className={cx(
              "inline-flex rounded-[10px] px-3 py-1 text-[12px] font-extrabold shadow-sm",
              badge.className
            )}
          >
            {badge.label}
          </span>

          <span
            aria-hidden="true"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/92 text-[#8D96AB] shadow-sm"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-[16px] w-[16px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M12 20.5s-7.25-4.35-7.25-10.1a4.2 4.2 0 0 1 7.25-2.7 4.2 4.2 0 0 1 7.25 2.7c0 5.75-7.25 10.1-7.25 10.1Z" />
            </svg>
          </span>
        </div>

        {item.below_fipe ? (
          <div className="absolute left-3 top-12 inline-flex rounded-md bg-blue-700 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm">
            Abaixo da FIPE
          </div>
        ) : null}
      </div>

      <div className={cx("px-4 pb-4 pt-4", featured && "md:px-5 md:pb-5 md:pt-4")}>
        <h3
          className={cx(
            "line-clamp-2 min-h-[44px] font-bold uppercase leading-tight tracking-tight text-slate-900",
            featured ? "text-lg md:text-xl" : "text-base"
          )}
        >
          {title}
        </h3>

        <p className="mt-2 line-clamp-1 text-sm text-slate-600">{meta}</p>
        <p className="mt-1 text-sm text-slate-500">{location}</p>
        {listedHint ? (
          <p className="mt-1 text-[12px] font-medium text-[#8B94A8]">{listedHint}</p>
        ) : null}

        <div className="mt-4 flex items-end justify-between gap-3">
          <div
            className={cx(
              "font-bold leading-none text-blue-700",
              featured ? "text-2xl" : "text-xl"
            )}
          >
            {formatCurrency(price)}
          </div>

          <div className="rounded-md bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600">
            {financeChip}
          </div>
        </div>

        <div
          className={cx(
            "mt-4 inline-flex w-full items-center justify-center rounded-md bg-blue-700 font-semibold text-white transition hover:bg-blue-800",
            featured ? "h-12 text-base" : "h-11 text-[15px]"
          )}
        >
          Ver detalhes
        </div>
      </div>
    </>
  );

  if (linkMode === "none") {
    return <article className={cardClasses}>{content}</article>;
  }

  return (
    <article className={cardClasses}>
      <Link href={href} className="block" aria-label={`Ver detalhes de ${title}`}>
        {content}
      </Link>
    </article>
  );
}

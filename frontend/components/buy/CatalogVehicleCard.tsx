// frontend/components/buy/CatalogVehicleCard.tsx
import Link from "next/link";
import type { AdItem } from "@/lib/search/ads-search";

export type CatalogItem = AdItem & {
  title?: string;
  brand?: string;
  model?: string;
  version?: string;
  year?: number | string;
  mileage?: number | string;
  transmission?: string;
  fuel_type?: string;
  city?: string;
  state?: string;
  price?: number | string;
  image_url?: string | null;
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
}

function parseMoney(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;

  const normalized = String(value)
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
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

function parseMileage(value?: number | string) {
  if (typeof value === "number") return value;
  if (!value) return 0;

  const cleaned = String(value).replace(/[^\d]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMileage(value?: number | string) {
  const parsed = parseMileage(value);
  if (!parsed) return null;
  return `${parsed.toLocaleString("pt-BR")} km`;
}

function getHref(item: CatalogItem) {
  if (item.slug) return `/veiculo/${item.slug}`;
  return `/anuncios/${item.id}`;
}

function getImage(item: CatalogItem) {
  if (item.image_url) return item.image_url;
  if (Array.isArray(item.images) && item.images[0]) return item.images[0];
  return "/images/hero.jpeg";
}

function getTitle(item: CatalogItem) {
  if (item.title) return item.title;
  const pieces = [item.year, item.brand, item.model].filter(Boolean);
  return pieces.join(" ") || "Veículo";
}

function getMetaLine(item: CatalogItem) {
  const pieces = [
    item.fuel_type,
    formatMileage(item.mileage),
    item.transmission,
  ].filter(Boolean);

  if (pieces.length > 0) return pieces.join("  •  ");
  return "Automático";
}

function getLocation(item: CatalogItem) {
  return [item.city || "São Paulo", item.state || "SP"].join(" - ");
}

function getBadge(weight: 1 | 2 | 3 | 4) {
  if (weight === 4) {
    return {
      label: "Destaque",
      className: "bg-[#118A93] text-white",
    };
  }

  if (weight === 3) {
    return {
      label: "Loja Premium",
      className: "bg-[#193E98] text-white",
    };
  }

  if (weight === 2) {
    return {
      label: "Loja",
      className: "bg-[#EEF4FF] text-[#1F66E5] ring-1 ring-[#D8E2FB]",
    };
  }

  return {
    label: "Anúncio",
    className: "bg-[#F2F5FA] text-[#6C7488] ring-1 ring-[#E8ECF3]",
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
}: CatalogVehicleCardProps) {
  const href = getHref(item);
  const title = getTitle(item);
  const price = parseMoney(item.price);
  const location = getLocation(item);
  const meta = getMetaLine(item);
  const badge = getBadge(weight);
  const financeChip = getFinanceChip(weight, item);

  return (
    <article
      className={`group overflow-hidden rounded-[18px] border border-[#E5E9F2] bg-white shadow-[0_10px_24px_rgba(20,30,60,0.06)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(20,30,60,0.10)] ${
        featured ? "rounded-[20px]" : ""
      }`}
    >
      <Link href={href} className="block">
        <div className={`relative overflow-hidden ${featured ? "aspect-[1.33/0.83]" : "aspect-[1.18/0.84]"}`}>
          <img
            src={getImage(item)}
            alt={title}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            loading="lazy"
          />

          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
            <span
              className={`inline-flex rounded-[10px] px-3 py-1 text-[12px] font-extrabold shadow-sm ${badge.className}`}
            >
              {badge.label}
            </span>

            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/92 text-[#8D96AB] shadow-sm">
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
            <div className="absolute left-3 top-12 inline-flex rounded-[10px] bg-[#1C5E47] px-3 py-1 text-[12px] font-extrabold text-white shadow-sm">
              Abaixo da FIPE
            </div>
          ) : null}
        </div>

        <div className={`px-4 pb-4 pt-4 ${featured ? "md:px-5 md:pb-5 md:pt-4" : ""}`}>
          <h3
            className={`line-clamp-2 font-extrabold leading-[1.12] text-[#1D2440] ${
              featured ? "text-[20px]" : "text-[17px]"
            }`}
          >
            {title}
          </h3>

          <p className="mt-2 line-clamp-1 text-[15px] text-[#6E748A]">{meta}</p>
          <p className="mt-1 text-[15px] text-[#6E748A]">{location}</p>

          <div className="mt-4 flex items-end justify-between gap-3">
            <div className={`font-extrabold leading-none text-[#1F66E5] ${featured ? "text-[24px]" : "text-[20px]"}`}>
              {formatCurrency(price)}
            </div>

            <div className="rounded-[10px] bg-[#F2F5FA] px-3 py-2 text-[11px] font-bold text-[#6B7489]">
              {financeChip}
            </div>
          </div>

          <div
            className={`mt-4 inline-flex w-full items-center justify-center rounded-[12px] bg-[#1F66E5] font-bold text-white transition hover:bg-[#1758CC] ${
              featured ? "h-[50px] text-[18px]" : "h-[46px] text-[16px]"
            }`}
          >
            Ver detalhes
          </div>
        </div>
      </Link>
    </article>
  );
}

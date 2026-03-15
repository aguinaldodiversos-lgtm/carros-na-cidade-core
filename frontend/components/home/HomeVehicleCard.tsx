import Link from "next/link";

type VehicleItem = {
  id: number | string;
  slug?: string;
  title?: string;
  brand?: string;
  model?: string;
  year?: number | string;
  mileage?: number | string;
  city?: string;
  state?: string;
  price?: number | string;
  below_fipe?: boolean;
  highlight_until?: string | null;
  image_url?: string | null;
  images?: string[] | null;
};

interface HomeVehicleCardProps {
  item: VehicleItem;
  variant: "highlight" | "opportunity";
}

function parseNumber(value?: number | string) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPrice(value?: number | string) {
  const numeric = parseNumber(value);
  if (!numeric) return "R$ 0";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(numeric);
}

function formatMileage(value?: number | string) {
  const numeric = parseNumber(value);
  if (!numeric) return null;
  return `${numeric.toLocaleString("pt-BR")} km`;
}

function buildTitle(item: VehicleItem) {
  if (item.title) return item.title;
  return [item.year, item.brand, item.model].filter(Boolean).join(" ") || "Veículo";
}

function resolveImage(item: VehicleItem) {
  if (item.image_url) return item.image_url;
  if (Array.isArray(item.images) && item.images[0]) return item.images[0];
  return "/images/hero.jpeg";
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function resolveHref(item: VehicleItem) {
  if (item.slug) return `/comprar/${item.slug}`;

  const fallback = [item.title, item.brand, item.model, item.year, item.id]
    .filter(Boolean)
    .join(" ");

  return `/comprar/${slugify(fallback || `anuncio-${item.id}`)}`;
}

function buildOfferLabel(item: VehicleItem, variant: "highlight" | "opportunity") {
  if (variant === "opportunity" || item.below_fipe) return "Abaixo da FIPE";
  if (item.highlight_until) return "Oferta destaque";
  return "Em destaque";
}

export function HomeVehicleCard({ item, variant }: HomeVehicleCardProps) {
  const title = buildTitle(item);
  const image = resolveImage(item);
  const href = resolveHref(item);
  const mileage = formatMileage(item.mileage);
  const cityLabel = [item.city || "São Paulo", item.state || "SP"].join(" - ");
  const badgeText =
    variant === "opportunity" || item.below_fipe ? "Abaixo da FIPE" : "Patrocinado";

  return (
    <Link
      href={href}
      className="group overflow-hidden rounded-[18px] border border-[#e1e6f0] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(15,23,42,0.12)]"
    >
      <div className="relative aspect-[1.18/1] overflow-hidden">
        <img
          src={image}
          alt={title}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          loading="lazy"
        />

        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <span className="inline-flex rounded-[9px] bg-[#0e62d8] px-3 py-1 text-[12px] font-extrabold text-white shadow-sm">
            {badgeText}
          </span>

          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/92 text-[#95a0b7] shadow-sm">
            <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 20.5s-7.25-4.35-7.25-10.1a4.2 4.2 0 0 1 7.25-2.7 4.2 4.2 0 0 1 7.25 2.7c0 5.75-7.25 10.1-7.25 10.1Z" />
            </svg>
          </span>
        </div>
      </div>

      <div className="px-4 pb-4 pt-3">
        <h3 className="line-clamp-2 text-[17px] font-extrabold leading-[1.2] text-[#1c263a]">
          {title}
        </h3>

        <p className="mt-2 text-[15px] text-[#6e778a]">{cityLabel}</p>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-[16px] font-extrabold text-[#0e62d8] md:text-[18px]">
            {formatPrice(item.price)}
          </div>

          <span className="rounded-[8px] bg-[#eef4ff] px-2.5 py-1 text-[11px] font-bold text-[#0e62d8]">
            {buildOfferLabel(item, variant)}
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-[13px] font-medium text-[#7b8497]">
            {mileage || "Baixa quilometragem"}
          </div>

          <span className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#f2f5fa] text-[#46536f] transition group-hover:bg-[#0e62d8] group-hover:text-white">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}

import Image from "next/image";
import Link from "next/link";
import type { AdItem } from "@/lib/search/ads-search";

interface AdCardProps {
  item: AdItem;
  priority?: boolean;
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

export function AdCard({ item, priority = false }: AdCardProps) {
  const image = resolveImage(item);
  const href = resolveAdHref(item);
  const title = buildTitle(item);
  const location = [item.city, item.state].filter(Boolean).join(" - ");
  const hasBelowFipe = item.below_fipe === true;
  const hasHighlight = Boolean(item.highlight_until);
  const detailSlug = resolveDetailSlug(item);
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
    item.plan
      ? {
          key: "plan",
          label: item.plan,
          icon: null,
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
  }>;

  return (
    <article className="h-full overflow-hidden rounded-[24px] border border-[#dbe4f0] bg-white shadow-[0_14px_36px_rgba(15,23,42,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_48px_rgba(15,23,42,0.14)]">
      <Link
        href={href}
        aria-label={`Ver detalhes de ${title}`}
        className="group flex h-full flex-col"
      >
        <div className="relative aspect-[16/10] overflow-hidden bg-[#edf2f8]">
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
            {hasHighlight ? (
              <span className="rounded-full bg-[#0a7c83] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-sm">
                Destaque
              </span>
            ) : null}

            {hasBelowFipe ? (
              <span className="rounded-full bg-[#0e62d8] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-sm">
                Abaixo da FIPE
              </span>
            ) : null}
          </div>

          <span className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/92 text-[#455066] shadow-sm backdrop-blur">
            <FavoriteIcon />
          </span>

          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 px-4 pb-4">
            <div className="rounded-full bg-white/92 px-3 py-1 text-[11px] font-bold text-[#1d2538] shadow-sm backdrop-blur">
              ID {detailSlug}
            </div>
            <div className="rounded-full bg-[#081120]/72 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
              Ver veículo
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col p-5">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#0e62d8]">
            Anúncio premium
          </div>

          <h3 className="mt-2 line-clamp-2 min-h-[3.25rem] text-[19px] font-black leading-6 text-[#162033]">
            {title}
          </h3>

          <div className="mt-3 inline-flex items-center gap-2 text-sm text-[#5f6982]">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#eef4ff] text-[#0e62d8]">
              <LocationIcon />
            </span>
            <span>{location || "Localização não informada"}</span>
          </div>

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
        </div>
      </Link>
    </article>
  );
}

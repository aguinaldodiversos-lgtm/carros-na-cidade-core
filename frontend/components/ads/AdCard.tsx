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

function resolveAdHref(item: AdItem) {
  if (item.slug) return `/veiculo/${item.slug}`;
  return `/anuncios/${item.id}`;
}

function buildTitle(item: AdItem) {
  if (item.title?.trim()) return item.title.trim();
  return [item.year, item.brand, item.model].filter(Boolean).join(" ") || "Veículo";
}

function FavoriteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="white" stroke="rgba(0,0,0,0.08)" strokeWidth="1">
      <path d="M12 20.5s-7.25-4.35-7.25-10.1a4.2 4.2 0 0 1 7.25-2.7 4.2 4.2 0 0 1 7.25 2.7c0 5.75-7.25 10.1-7.25 10.1Z" />
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

  return (
    <article className="overflow-hidden rounded-[22px] border border-[#e1e7f0] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(15,23,42,0.12)]">
      <Link href={href} className="group block">
        <div className="relative aspect-[16/10] overflow-hidden bg-[#edf2f8]">
          <Image
            src={image}
            alt={title}
            fill
            priority={priority}
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
            className="object-cover transition duration-300 group-hover:scale-[1.03]"
          />

          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/25 to-transparent" />

          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            {hasHighlight ? (
              <span className="rounded-lg bg-[#0a7c83] px-3 py-1 text-[11px] font-bold text-white shadow-sm">
                Destaque
              </span>
            ) : null}

            {hasBelowFipe ? (
              <span className="rounded-lg bg-[#0e62d8] px-3 py-1 text-[11px] font-bold text-white shadow-sm">
                Abaixo da FIPE
              </span>
            ) : null}
          </div>

          <button
            type="button"
            aria-label="Favoritar"
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/92 shadow-sm"
          >
            <FavoriteIcon />
          </button>
        </div>
      </Link>

      <div className="p-4">
        <Link href={href} className="block">
          <h3 className="line-clamp-2 text-[17px] font-extrabold leading-6 text-[#1d2538]">
            {title}
          </h3>
        </Link>

        <div className="mt-1 text-sm text-[#6b7488]">{location || "Localização não informada"}</div>

        <div className="mt-3 flex flex-wrap gap-2 text-[14px] text-[#616b80]">
          {item.year ? <span>{item.year}</span> : null}
          {item.mileage ? <span>• {formatMileage(item.mileage)}</span> : null}
          {item.plan ? <span>• {item.plan}</span> : null}
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <div className="text-[18px] font-black tracking-tight text-[#0e62d8] md:text-[20px]">
              {formatPrice(item.price)}
            </div>
          </div>

          {hasBelowFipe ? (
            <span className="rounded-md bg-[#eef5ff] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#0e62d8]">
              Oferta
            </span>
          ) : null}
        </div>

        <Link
          href={href}
          className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#0e62d8] px-4 text-[17px] font-bold text-white transition hover:bg-[#0c4fb0]"
        >
          Ver detalhes
        </Link>
      </div>
    </article>
  );
}
